// Configuration - Set your OpenAI API key here for local development
// IMPORTANT: Never commit this file with your API key to version control!
const CONFIG = {
    OPENAI_API_KEY: '' // Enter your OpenAI API key here, e.g., 'sk-...'
};

// Data Model
class VocabularyWord {
    constructor(data) {
        this.id = data.id || Date.now().toString();
        this.spanish = data.spanish || '';
        this.english = data.english || '';
        this.originalLanguage = data.originalLanguage || 'english'; // 'english' or 'spanish'
        this.review = data.review !== undefined ? data.review : true; // Default to review for new words
        this.exampleSentences = data.exampleSentences || [];
        this.partOfSpeech = data.partOfSpeech || '';
        this.conjugations = data.conjugations || null; // null if not a verb, object with tenses if verb
        this.hint = Array.isArray(data.hint) ? data.hint : (data.hint ? [data.hint] : []); // Array of 2 mnemonic hints for quiz mode
        
        // Spaced Repetition Fields
        this.masteryLevel = data.masteryLevel || 'review'; // 'review' or 'completed'
        this.reviewCount = data.reviewCount || 0;
        this.lastReviewed = data.lastReviewed ? new Date(data.lastReviewed) : null;
        this.nextReview = data.nextReview ? new Date(data.nextReview) : new Date();
        this.streak = data.streak || 0;
    }
    
    // Calculate if word is due for review
    isDueForReview() {
        if (this.masteryLevel === 'completed') return false;
        return new Date() >= this.nextReview;
    }
    
    // Update mastery after correct answer
    markCorrect() {
        this.reviewCount++;
        this.streak++;
        this.lastReviewed = new Date();
        
        // Calculate next review date: 2^reviewCount days (max 30 days)
        const daysUntilReview = Math.min(Math.pow(2, this.reviewCount), 30);
        this.nextReview = new Date();
        this.nextReview.setDate(this.nextReview.getDate() + daysUntilReview);
        
        // After 5 correct answers, mark as completed
        if (this.reviewCount >= 5) {
            this.masteryLevel = 'completed';
        }
    }
    
    // Update mastery after incorrect answer
    markIncorrect() {
        this.reviewCount = Math.max(0, this.reviewCount - 1);
        this.streak = 0;
        this.lastReviewed = new Date();
        this.nextReview = new Date(); // Review immediately
        this.masteryLevel = 'review';
    }
}

// Storage Utilities
const Storage = {
    // Check if localStorage is available
    isAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    // Serialize words for storage (convert Date objects to ISO strings)
    serializeWords(words) {
        return words.map(word => {
            const serialized = { ...word };
            // Convert Date objects to ISO strings
            if (serialized.lastReviewed instanceof Date) {
                serialized.lastReviewed = serialized.lastReviewed.toISOString();
            }
            if (serialized.nextReview instanceof Date) {
                serialized.nextReview = serialized.nextReview.toISOString();
            }
            return serialized;
        });
    },

    getWords() {
        if (!this.isAvailable()) {
            console.warn('localStorage is not available. Words will not persist.');
            return [];
        }

        try {
            const stored = localStorage.getItem('vocabularyWords');
            if (!stored) return [];
            
            const words = JSON.parse(stored);
            // Ensure we have an array
            return Array.isArray(words) ? words : [];
        } catch (error) {
            console.error('Error loading words from localStorage:', error);
            // Try to recover by clearing corrupted data
            try {
                localStorage.removeItem('vocabularyWords');
            } catch (e) {
                // Ignore cleanup errors
            }
            return [];
        }
    },

    saveWords(words) {
        if (!this.isAvailable()) {
            console.warn('localStorage is not available. Words will not be saved.');
            return false;
        }

        try {
            const serialized = this.serializeWords(words);
            localStorage.setItem('vocabularyWords', JSON.stringify(serialized));
            return true;
        } catch (error) {
            // Handle quota exceeded error
            if (error.name === 'QuotaExceededError') {
                console.error('localStorage quota exceeded. Consider removing some words.');
                alert('Storage is full. Please remove some words to free up space.');
            } else {
                console.error('Error saving words to localStorage:', error);
            }
            return false;
        }
    },

    addWord(word) {
        const words = this.getWords();
        words.push(word);
        this.saveWords(words);
        return words;
    },

    updateWord(wordId, updates) {
        const words = this.getWords();
        const index = words.findIndex(w => w.id === wordId);
        if (index !== -1) {
            const updatedWord = { ...words[index], ...updates };
            words[index] = updatedWord;
            this.saveWords(words);
        }
        return words;
    },

    deleteWord(wordId) {
        const words = this.getWords();
        const filtered = words.filter(w => w.id !== wordId);
        this.saveWords(filtered);
        return filtered;
    }
};

// OpenAI API Integration
const OpenAI = {
    // Check if we should use the Vercel API proxy (when deployed)
    // Falls back to direct API calls for local development
    async makeApiRequest(endpoint, body) {
        // Check if we're on Vercel (or if API proxy is available)
        // In production, use the API proxy to keep API key server-side
        const isVercel = window.location.hostname.includes('vercel.app') || 
                        window.location.hostname.includes('vercel.dev');
        
        if (isVercel) {
            // Use Vercel serverless function proxy
            try {
                const response = await fetch('/api/openai', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        endpoint: endpoint,
                        body: body
                    })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'API proxy error');
                }
                
                return await response.json();
            } catch (error) {
                // If proxy fails, fall back to direct API call
                console.warn('API proxy failed, falling back to direct API call:', error);
                const headers = this.getApiHeaders();
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body)
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || 'OpenAI API error');
                }
                
                return await response.json();
            }
        } else {
            // Local development: use direct API calls with API key from config/localStorage
            const headers = this.getApiHeaders();
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'OpenAI API error');
            }
            
            return await response.json();
        }
    },

    // Helper function to get clean API key and create headers (for local development)
    getApiHeaders() {
        let apiKey = CONFIG.OPENAI_API_KEY || window.OPENAI_API_KEY;
        
        // Try to get from localStorage if not already set
        if (!apiKey && Storage.isAvailable()) {
            try {
                apiKey = localStorage.getItem('openai_api_key');
            } catch (error) {
                console.error('Error reading API key from localStorage:', error);
            }
        }
        
        if (!apiKey) {
            throw new Error('OpenAI API key not found. Please enter your API key in the CONFIG section at the top of app.js, or use the settings section in the UI.');
        }
        
        // Ensure API key is a string and trim whitespace
        let cleanApiKey = String(apiKey).trim();
        
        // Remove any non-ASCII characters that could cause encoding issues
        // Keep only printable ASCII characters (32-126) which includes letters, numbers, and common symbols
        cleanApiKey = cleanApiKey.split('').filter(char => {
            const code = char.charCodeAt(0);
            return code >= 32 && code <= 126;
        }).join('');
        
        // Build headers with explicit string construction to avoid any encoding issues
        const contentType = 'application/json';
        const authHeader = 'Bearer ' + cleanApiKey;
        
        // Return plain object literal - this is the most compatible format
        return {
            'Content-Type': contentType,
            'Authorization': authHeader
        };
    },

    async generateWordData(word) {
        // Escape the word to prevent issues with special characters
        const escapedWord = String(word).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        
        const prompt = `You are a Spanish language learning assistant. Analyze the word "${escapedWord}" and provide a JSON response with the following structure:

{
  "detectedLanguage": "english" or "spanish",
  "spanish": "Spanish translation",
  "english": "English translation",
  "partOfSpeech": "noun/verb/adjective/adverb/etc",
  "exampleSentences": ["sentence 1", "sentence 2", "sentence 3", "sentence 4"],
  "isVerb": true/false,
  "conjugations": {
    "present": {"yo": "...", "tú": "...", "él/ella/usted": "...", "nosotros": "...", "vosotros": "...", "ellos/ellas/ustedes": "..."},
    "preterite": {...},
    "imperfect": {...},
    "conditional": {...},
    "subjunctive": {...},
    "future": {...},
    "irregularForms": ["yo", "tú", ...] // list of person forms that are irregular
  }
}

IMPORTANT: 
- All Spanish translations, example sentences, and conjugations MUST be in Mexican Spanish dialect. Use Mexican Spanish vocabulary, expressions, and conventions.
- Example sentences MUST ALWAYS be in Spanish (Mexican Spanish), regardless of whether the input word is English or Spanish. Each example sentence should be formatted as: "Spanish sentence\n(English translation)". The English translation should be on a new line in parentheses after the Spanish sentence, separated by a newline character.
- If the word appears to be misspelled, infer the most likely intended word based on context and common spelling errors. Use your best judgment to determine what the user likely meant.
- If the word is not a verb, set "isVerb" to false and "conjugations" to null.
- For irregular forms, list the specific person forms (e.g., ["yo", "tú"]) that are irregular.
- Provide 2-4 example sentences (always in Spanish with English translations on a new line).
Return ONLY valid JSON, no additional text.`;

        try {
            const data = await this.makeApiRequest('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful Spanish language learning assistant. Always respond with valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' }
            });

            const content = JSON.parse(data.choices[0].message.content);
            
            // Generate two mnemonic hints for quiz mode
            let hints = [];
            try {
                hints = await this.generateMnemonicHint(
                    content.english,
                    content.spanish,
                    content.partOfSpeech
                );
            } catch (error) {
                console.error('Error generating hints during word creation:', error);
                // Continue without hints if generation fails
            }
            
            return {
                spanish: content.spanish,
                english: content.english,
                originalLanguage: content.detectedLanguage,
                partOfSpeech: content.partOfSpeech,
                exampleSentences: content.exampleSentences || [],
                conjugations: content.isVerb ? content.conjugations : null,
                hint: hints
            };
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    },

    async generateMnemonics(spanishWord, englishWord) {
        const headers = this.getApiHeaders();
        
        // Escape words to prevent issues with special characters
        const escapedSpanish = String(spanishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        const escapedEnglish = String(englishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        
        const prompt = `Generate 1-3 English mnemonics to help a native English speaker remember the Spanish word "${escapedSpanish}" (which means "${escapedEnglish}" in English). Note that "${escapedSpanish}" is in Mexican Spanish.

The mnemonics should:
- Be in English
- Help create associations, wordplay, or memory tricks
- Make it easy for an English speaker to remember the Spanish word

Return a JSON object with this structure:
{
  "mnemonics": ["mnemonic 1", "mnemonic 2", "mnemonic 3"]
}

Return ONLY valid JSON, no additional text.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a helpful Spanish language learning assistant. Always respond with valid JSON only.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'OpenAI API error');
            }

            const data = await response.json();
            const content = JSON.parse(data.choices[0].message.content);
            
            return content.mnemonics || [];
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    },

    async generateExampleSentences(spanishWord, englishWord, partOfSpeech) {
        // Escape words to prevent issues with special characters
        const escapedSpanish = String(spanishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        const escapedEnglish = String(englishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        
        const prompt = `Generate 2-4 example sentences in Spanish (Mexican Spanish) for the word "${escapedSpanish}" (which means "${escapedEnglish}" in English). The word is a ${partOfSpeech || 'word'}.

The example sentences should:
- Be in Spanish (Mexican Spanish dialect)
- Demonstrate how to use the Spanish word "${escapedSpanish}" in context
- Be natural and practical examples
- Use Mexican Spanish vocabulary and expressions

Return a JSON object with this structure:
{
  "exampleSentences": ["sentence 1", "sentence 2", "sentence 3", "sentence 4"]
}

Return ONLY valid JSON, no additional text.`;

        try {
            const data = await this.makeApiRequest('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful Spanish language learning assistant. Always respond with valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' }
            });

            const content = JSON.parse(data.choices[0].message.content);
            
            return content.exampleSentences || [];
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    },

    async generateMnemonicHint(englishWord, spanishWord, partOfSpeech) {
        // Escape words to prevent issues with special characters
        const escapedSpanish = String(spanishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        const escapedEnglish = String(englishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        
        const prompt = `Generate TWO different mnemonic hints in English to help an English speaker remember the Spanish word "${escapedSpanish}" (which means "${escapedEnglish}" in English and is a ${partOfSpeech || 'word'}).

IMPORTANT:
- Do NOT mention the actual Spanish word "${escapedSpanish}" in either hint
- Both hints should be in English
- Focus on the PRONUNCIATION of the Spanish word - create memory tricks based on how "${escapedSpanish}" sounds when pronounced in Spanish
- Use English words that sound similar to the Spanish pronunciation to create associations
- Make both hints creative and memorable, but DIFFERENT from each other
- Each hint should help someone recall the Spanish word by thinking about its pronunciation, not its meaning
- Example: If the Spanish word sounds like an English word or phrase, use that similarity
- Provide two distinct approaches to remembering the pronunciation

Return a JSON object with this structure:
{
  "hints": ["first mnemonic hint based on Spanish pronunciation", "second mnemonic hint based on Spanish pronunciation"]
}

Return ONLY valid JSON, no additional text.`;

        try {
            const data = await this.makeApiRequest('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful Spanish language learning assistant. Always respond with valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                response_format: { type: 'json_object' }
            });

            const content = JSON.parse(data.choices[0].message.content);
            
            // Return array of hints, ensuring we have exactly 2
            const hints = content.hints || [];
            if (hints.length === 0 && content.hint) {
                // Fallback for old format with single hint
                return [content.hint];
            }
            return hints.slice(0, 2); // Ensure we only return up to 2 hints
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    }
};

// Application State
const AppState = {
    words: [],
    displayLanguage: 'spanish', // 'spanish' or 'english'
    reviewOnly: false,
    currentView: 'home', // 'home' or 'quiz'
    currentQuizIndex: 0,
    quizWords: [],

    init() {
        const storedWords = Storage.getWords();
        // Convert stored words to VocabularyWord instances
        this.words = storedWords.map(w => new VocabularyWord(w));
        this.loadSettings();
        this.updateQuizWords();
    },

    loadSettings() {
        if (!Storage.isAvailable()) {
            console.warn('localStorage is not available. Settings will not persist.');
            return;
        }

        try {
            const savedLang = localStorage.getItem('displayLanguage');
            const savedReviewOnly = localStorage.getItem('reviewOnly');
            if (savedLang) this.displayLanguage = savedLang;
            if (savedReviewOnly !== null) this.reviewOnly = savedReviewOnly === 'true';
        } catch (error) {
            console.error('Error loading settings from localStorage:', error);
        }
    },

    saveSettings() {
        if (!Storage.isAvailable()) {
            console.warn('localStorage is not available. Settings will not be saved.');
            return;
        }

        try {
            localStorage.setItem('displayLanguage', this.displayLanguage);
            localStorage.setItem('reviewOnly', this.reviewOnly.toString());
        } catch (error) {
            console.error('Error saving settings to localStorage:', error);
        }
    },

    updateQuizWords() {
        this.quizWords = this.words.filter(w => {
            const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
            // Only include words that are enabled for review AND due for review
            return vocabWord.review && vocabWord.isDueForReview && vocabWord.isDueForReview();
        });
    },

    getFilteredWords() {
        let filtered = [...this.words];
        if (this.reviewOnly) {
            filtered = filtered.filter(w => {
                const vocabWord = new VocabularyWord(w);
                // Show only words that have review enabled
                return vocabWord.review === true;
            });
        }
        return filtered;
    }
};

// UI Components
const UI = {
    init() {
        this.setupEventListeners();
        this.render();
    },

    setupEventListeners() {
        // Navigation
        document.getElementById('homeBtn').addEventListener('click', () => this.showView('home'));
        document.getElementById('quizBtn').addEventListener('click', () => this.showView('quiz'));

        // Segmented control for native language
        document.querySelectorAll('.segmented-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const lang = e.currentTarget.dataset.lang;
                document.querySelectorAll('.segmented-option').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                AppState.displayLanguage = lang === 'spanish' ? 'spanish' : 'english';
                AppState.saveSettings();
                this.render();
            });
        });

        // Review toggle
        document.getElementById('reviewOnlyToggle').addEventListener('change', (e) => {
            AppState.reviewOnly = e.target.checked;
            AppState.saveSettings();
            this.render();
        });

        // Modal controls
        document.getElementById('addWordBtn').addEventListener('click', () => {
            document.getElementById('addWordModal').classList.add('active');
        });

        document.getElementById('closeModalBtn').addEventListener('click', () => {
            document.getElementById('addWordModal').classList.remove('active');
        });

        document.querySelector('.modal-backdrop').addEventListener('click', () => {
            document.getElementById('addWordModal').classList.remove('active');
        });

        // Quick add word input
        document.getElementById('quickAddBtn').addEventListener('click', () => this.handleQuickAddWord());
        document.getElementById('quickAddInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleQuickAddWord();
        });

        // Submit word from modal
        document.getElementById('submitWordBtn').addEventListener('click', () => this.handleAddWord());
        document.getElementById('spanishWordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddWord();
        });
        document.getElementById('englishWordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddWord();
        });

        // API Key management
        const apiKeyInput = document.getElementById('apiKeyInput');
        const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
        const toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn');
        const apiKeyContainer = document.getElementById('apiKeyInputContainer');
        
        // Load saved API key (prioritize CONFIG if set)
        if (CONFIG.OPENAI_API_KEY) {
            apiKeyInput.value = '*** (set in CONFIG)';
            apiKeyInput.disabled = true;
            saveApiKeyBtn.disabled = true;
            saveApiKeyBtn.textContent = 'Using CONFIG key';
        } else {
            try {
                const savedKey = localStorage.getItem('openai_api_key');
                if (savedKey) {
                    window.OPENAI_API_KEY = savedKey;
                    apiKeyInput.value = savedKey;
                }
            } catch (error) {
                console.error('Error loading API key from localStorage:', error);
            }
        }

        toggleApiKeyBtn.addEventListener('click', () => {
            const isHidden = apiKeyContainer.classList.contains('hidden');
            if (isHidden) {
                apiKeyContainer.classList.remove('hidden');
                toggleApiKeyBtn.textContent = 'Hide';
            } else {
                apiKeyContainer.classList.add('hidden');
                toggleApiKeyBtn.textContent = 'Show';
            }
        });

        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (key) {
                window.OPENAI_API_KEY = key;
                try {
                    if (Storage.isAvailable()) {
                        localStorage.setItem('openai_api_key', key);
                        alert('API key saved successfully!');
                    } else {
                        alert('API key saved for this session only (localStorage unavailable).');
                    }
                } catch (error) {
                    console.error('Error saving API key to localStorage:', error);
                    alert('API key saved for this session only. Could not save to localStorage.');
                }
            } else {
                alert('Please enter an API key.');
            }
        });

        // Update mnemonics (if button exists)
        const updateMnemonicsBtn = document.getElementById('updateMnemonicsBtn');
        if (updateMnemonicsBtn) {
            updateMnemonicsBtn.addEventListener('click', () => this.handleUpdateMnemonics());
        }
        
        // Update example sentences (if button exists)
        const updateExampleSentencesBtn = document.getElementById('updateExampleSentencesBtn');
        if (updateExampleSentencesBtn) {
            updateExampleSentencesBtn.addEventListener('click', () => this.handleUpdateExampleSentences());
        }
        
        // Update hints (if button exists)
        const updateHintsBtn = document.getElementById('updateHintsBtn');
        if (updateHintsBtn) {
            updateHintsBtn.addEventListener('click', () => this.handleUpdateHints());
        }

        // Quiz controls
        document.getElementById('quizLanguageToggle').addEventListener('change', (e) => {
            AppState.displayLanguage = e.target.value;
            AppState.saveSettings();
            this.renderQuiz();
        });

        document.getElementById('revealBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.revealTranslation();
        });
        document.getElementById('hintBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.giveHint();
        });
        document.getElementById('examplesBtn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showExampleSentences();
        });
        document.getElementById('removeFromReviewBtn').addEventListener('click', () => this.removeFromReview());
        document.getElementById('nextQuizBtn').addEventListener('click', () => this.nextQuizWord());
    },

    showView(view) {
        AppState.currentView = view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        if (view === 'home') {
            document.getElementById('homeView').classList.add('active');
            document.getElementById('homeBtn').classList.add('active');
            this.render();
        } else {
            document.getElementById('quizView').classList.add('active');
            document.getElementById('quizBtn').classList.add('active');
            AppState.updateQuizWords();
            this.renderQuiz();
        }
    },

    async handleQuickAddWord() {
        const input = document.getElementById('quickAddInput');
        const inputText = input.value.trim();
        const statusEl = document.getElementById('quickAddStatus');
        
        if (!inputText) {
            statusEl.textContent = 'Please enter a word.';
            statusEl.className = 'status-message error';
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }, 3000);
            return;
        }

        const btn = document.getElementById('quickAddBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>...</span>';
        
        statusEl.textContent = 'Detecting language and processing word...';
        statusEl.className = 'status-message info';

        try {
            // Use OpenAI to detect language and handle typos
            const wordData = await OpenAI.generateWordData(inputText);
            
            const vocabWord = new VocabularyWord({
                ...wordData,
                masteryLevel: 'review',
                review: true,
                reviewCount: 0,
                streak: 0,
                nextReview: new Date()
            });

            const words = Storage.addWord(vocabWord);
            AppState.words = words.map(w => new VocabularyWord(w));
            
            statusEl.textContent = `Added: "${vocabWord.spanish}" / "${vocabWord.english}"`;
            statusEl.className = 'status-message success';
            
            input.value = '';
            input.focus();
            
            this.render();
            
            // Add animation to newly added word
            const newCard = document.getElementById(`vocab-card-${vocabWord.id}`);
            if (newCard) {
                newCard.classList.add('new-word');
                setTimeout(() => {
                    newCard.classList.remove('new-word');
                }, 1000);
            }
            
            // Clear status message after delay
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }, 3000);
        } catch (error) {
            console.error(`Error adding word:`, error);
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'status-message error';
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }, 5000);
        }
        
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="plus-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    },

    async handleAddWord() {
        const spanishInput = document.getElementById('spanishWordInput');
        const englishInput = document.getElementById('englishWordInput');
        const spanishText = spanishInput.value.trim();
        const englishText = englishInput.value.trim();
        const statusEl = document.getElementById('addWordStatus');
        
        if (!spanishText && !englishText) {
            statusEl.textContent = 'Please enter at least one word.';
            statusEl.className = 'status-message error';
            return;
        }

        const inputText = spanishText || englishText;
        const btn = document.getElementById('submitWordBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>Adding...</span>';
        
        statusEl.textContent = 'Processing word...';
        statusEl.className = 'status-message info';

        try {
            const wordData = await OpenAI.generateWordData(inputText);
            
            // Use provided values if available, otherwise use generated values
            const vocabWord = new VocabularyWord({
                ...wordData,
                spanish: spanishText || wordData.spanish,
                english: englishText || wordData.english,
                masteryLevel: 'review',
                review: true,
                reviewCount: 0,
                streak: 0,
                nextReview: new Date()
            });

            const words = Storage.addWord(vocabWord);
            AppState.words = words.map(w => new VocabularyWord(w));
            
            statusEl.textContent = `Successfully added "${vocabWord.spanish}" / "${vocabWord.english}"!`;
            statusEl.className = 'status-message success';
            
            spanishInput.value = '';
            englishInput.value = '';
            
            this.render();
            
            // Add animation to newly added word
            const newCard = document.getElementById(`vocab-card-${vocabWord.id}`);
            if (newCard) {
                newCard.classList.add('new-word');
                setTimeout(() => {
                    newCard.classList.remove('new-word');
                }, 1000);
            }
            
            // Close modal after short delay
            setTimeout(() => {
                document.getElementById('addWordModal').classList.remove('active');
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }, 1500);
        } catch (error) {
            console.error(`Error adding word:`, error);
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'status-message error';
        }
        
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="plus-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Add Word
        `;
    },

    async handleUpdateMnemonics() {
        const words = AppState.words;
        if (words.length === 0) {
            const statusEl = document.getElementById('updateMnemonicsStatus');
            statusEl.textContent = 'No words to update.';
            statusEl.className = 'status-message error';
            return;
        }

        const btn = document.getElementById('updateMnemonicsBtn');
        const statusEl = document.getElementById('updateMnemonicsStatus');
        
        btn.disabled = true;
        btn.textContent = 'Updating...';
        
        let updated = 0;
        let errors = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            statusEl.textContent = `Updating mnemonics for "${word.spanish}" (${i + 1}/${words.length})...`;
            statusEl.className = 'status-message info';

            try {
                const mnemonics = await OpenAI.generateMnemonics(word.spanish, word.english);
                const words = Storage.updateWord(word.id, { mnemonics });
                AppState.words = words.map(w => new VocabularyWord(w));
                updated++;
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error updating mnemonics for "${word.spanish}":`, error);
                errors++;
            }
        }

        btn.disabled = false;
        btn.textContent = 'Update All Mnemonics to English';
        
        if (updated > 0 && errors === 0) {
            statusEl.textContent = `Successfully updated mnemonics for ${updated} word(s)!`;
            statusEl.className = 'status-message success';
            this.render();
        } else if (updated > 0 && errors > 0) {
            statusEl.textContent = `Updated ${updated} word(s), ${errors} error(s).`;
            statusEl.className = 'status-message error';
            this.render();
        } else {
            statusEl.textContent = `Error: Failed to update mnemonics.`;
            statusEl.className = 'status-message error';
        }

        setTimeout(() => {
            if (statusEl.textContent.includes('Successfully')) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, 5000);
    },

    async handleUpdateExampleSentences() {
        const words = AppState.words;
        if (words.length === 0) {
            const statusEl = document.getElementById('updateExampleSentencesStatus');
            statusEl.textContent = 'No words to update.';
            statusEl.className = 'status-message error';
            return;
        }

        const btn = document.getElementById('updateExampleSentencesBtn');
        const statusEl = document.getElementById('updateExampleSentencesStatus');
        
        btn.disabled = true;
        btn.textContent = 'Updating...';
        
        let updated = 0;
        let errors = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            statusEl.textContent = `Updating example sentences for "${word.spanish}" (${i + 1}/${words.length})...`;
            statusEl.className = 'status-message info';

            try {
                // Always update to ensure translations are included
                const exampleSentences = await OpenAI.generateExampleSentences(
                    word.spanish, 
                    word.english, 
                    word.partOfSpeech
                );
                const words = Storage.updateWord(word.id, { exampleSentences });
                AppState.words = words.map(w => new VocabularyWord(w));
                updated++;
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error updating example sentences for "${word.spanish}":`, error);
                errors++;
            }
        }

        btn.disabled = false;
        btn.textContent = 'Update All Example Sentences to Spanish';
        
        if (updated > 0 && errors === 0) {
            statusEl.textContent = `Successfully updated example sentences with English translations for ${updated} word(s)!`;
            statusEl.className = 'status-message success';
            this.render();
        } else if (updated > 0 && errors > 0) {
            statusEl.textContent = `Updated ${updated} word(s), ${errors} error(s).`;
            statusEl.className = 'status-message error';
            this.render();
        } else {
            statusEl.textContent = `Error: Failed to update example sentences.`;
            statusEl.className = 'status-message error';
        }

        setTimeout(() => {
            if (statusEl.textContent.includes('Successfully')) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, 5000);
    },


    async handleUpdateExampleSentencesWithTranslations() {
        const words = AppState.words;
        if (words.length === 0) {
            const statusEl = document.getElementById('updateExampleSentencesStatus');
            statusEl.textContent = 'No words to update.';
            statusEl.className = 'status-message error';
            return;
        }

        const btn = document.getElementById('updateExampleSentencesBtn');
        const statusEl = document.getElementById('updateExampleSentencesStatus');
        
        btn.disabled = true;
        btn.textContent = 'Updating...';
        
        let updated = 0;
        let errors = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            statusEl.textContent = `Updating example sentences for "${word.spanish}" (${i + 1}/${words.length})...`;
            statusEl.className = 'status-message info';

            try {
                // Check if sentences already have translations in parentheses
                const needsUpdate = !word.exampleSentences || word.exampleSentences.length === 0 || 
                    word.exampleSentences.some(s => !s.includes('(') || !s.includes(')'));
                
                if (needsUpdate) {
                    const exampleSentences = await OpenAI.generateExampleSentences(
                        word.spanish, 
                        word.english, 
                        word.partOfSpeech
                    );
                    AppState.words = Storage.updateWord(word.id, { exampleSentences });
                    updated++;
                } else {
                    // Skip if already has translations
                    continue;
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error updating example sentences for "${word.spanish}":`, error);
                errors++;
            }
        }

        btn.disabled = false;
        btn.textContent = 'Update All Example Sentences to Spanish';
        
        if (updated > 0 && errors === 0) {
            statusEl.textContent = `Successfully updated example sentences for ${updated} word(s)!`;
            statusEl.className = 'status-message success';
            this.render();
        } else if (updated > 0 && errors > 0) {
            statusEl.textContent = `Updated ${updated} word(s), ${errors} error(s).`;
            statusEl.className = 'status-message error';
            this.render();
        } else if (updated === 0) {
            statusEl.textContent = `All example sentences already have English translations!`;
            statusEl.className = 'status-message success';
        } else {
            statusEl.textContent = `Error: Failed to update example sentences.`;
            statusEl.className = 'status-message error';
        }

        setTimeout(() => {
            if (statusEl.textContent.includes('Successfully') || statusEl.textContent.includes('already')) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, 5000);
    },

    async handleUpdateHints() {
        const words = AppState.words;
        if (words.length === 0) {
            const statusEl = document.getElementById('updateHintsStatus');
            statusEl.textContent = 'No words to update.';
            statusEl.className = 'status-message error';
            return;
        }

        const btn = document.getElementById('updateHintsBtn');
        const statusEl = document.getElementById('updateHintsStatus');
        
        btn.disabled = true;
        btn.textContent = 'Generating hints...';
        
        let updated = 0;
        let errors = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            statusEl.textContent = `Generating hint for "${word.spanish}" (${i + 1}/${words.length})...`;
            statusEl.className = 'status-message info';

            try {
                // Generate hints if they don't exist
                const vocabWord = new VocabularyWord(word);
                if (!vocabWord.hint || vocabWord.hint.length === 0) {
                    const hints = await OpenAI.generateMnemonicHint(
                        word.english,
                        word.spanish,
                        word.partOfSpeech
                    );
                    const words = Storage.updateWord(word.id, { hint: hints });
                    AppState.words = words.map(w => new VocabularyWord(w));
                    updated++;
                } else {
                    // Skip if hints already exist
                    continue;
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error generating hint for "${word.spanish}":`, error);
                errors++;
            }
        }

        btn.disabled = false;
        btn.textContent = 'Generate Hints for All Words';
        
        if (updated > 0 && errors === 0) {
            statusEl.textContent = `Successfully generated hints for ${updated} word(s)!`;
            statusEl.className = 'status-message success';
            this.render();
        } else if (updated > 0 && errors > 0) {
            statusEl.textContent = `Generated hints for ${updated} word(s), ${errors} error(s).`;
            statusEl.className = 'status-message error';
            this.render();
        } else if (updated === 0) {
            statusEl.textContent = `All words already have hints!`;
            statusEl.className = 'status-message success';
        } else {
            statusEl.textContent = `Error: Failed to generate hints.`;
            statusEl.className = 'status-message error';
        }

        setTimeout(() => {
            if (statusEl.textContent.includes('Successfully') || statusEl.textContent.includes('already')) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, 5000);
    },

    render() {
        if (AppState.currentView !== 'home') return;

        // Focus quick add input
        const quickAddInput = document.getElementById('quickAddInput');
        if (quickAddInput && document.activeElement !== quickAddInput) {
            // Only focus if no other input is focused
            setTimeout(() => {
                if (document.activeElement.tagName !== 'INPUT') {
                    quickAddInput.focus();
                }
            }, 100);
        }

        // Update toggle states
        document.getElementById('reviewOnlyToggle').checked = AppState.reviewOnly;
        
        // Update segmented control
        document.querySelectorAll('.segmented-option').forEach(btn => {
            const lang = btn.dataset.lang;
            if ((lang === 'spanish' && AppState.displayLanguage === 'spanish') ||
                (lang === 'english' && AppState.displayLanguage === 'english')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update vocabulary count
        const filteredWords = AppState.getFilteredWords();
        document.getElementById('vocabCount').textContent = `(${filteredWords.length})`;
        
        // Update review badge count (only words that are enabled for review AND due)
        const dueWords = AppState.words.filter(w => {
            const vocabWord = new VocabularyWord(w);
            return vocabWord.review && vocabWord.isDueForReview && vocabWord.isDueForReview();
        });
        document.getElementById('reviewBadge').textContent = `${dueWords.length} due`;

        // Render vocabulary cards
        const list = document.getElementById('vocabularyList');
        
        if (filteredWords.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 19.5C4 18.837 4.263 18.201 4.732 17.732L12.707 9.757C13.098 9.366 13.098 8.733 12.707 8.343L11.293 6.929C10.902 6.538 10.269 6.538 9.879 6.929L1.904 14.904C1.435 15.373 1.172 16.009 1.172 16.672V19.5C1.172 20.328 1.844 21 2.672 21H5.5C6.163 21 6.799 20.737 7.268 20.268L15.243 12.293C15.634 11.902 16.267 11.902 16.657 12.293L18.071 13.707C18.462 14.098 18.462 14.731 18.071 15.121L10.096 23.096C9.627 23.565 8.991 23.828 8.328 23.828H5.5C4.672 23.828 4 23.156 4 22.328V19.5Z" fill="currentColor"/>
                    </svg>
                    <p class="empty-state-message">No words found. Add some words to get started!</p>
                </div>
            `;
            return;
        }

        list.innerHTML = filteredWords.map((word, index) => this.renderWordCard(word, index)).join('');
        
        // Attach event listeners
        filteredWords.forEach(word => {
            // Attach review toggle listener
            const reviewToggle = document.getElementById(`review-toggle-${word.id}`);
            if (reviewToggle) {
                reviewToggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const words = Storage.updateWord(word.id, { review: e.target.checked });
                    AppState.words = words.map(w => new VocabularyWord(w));
                    AppState.updateQuizWords();
                    // Update the review badge count
                    const dueWords = AppState.words.filter(w => {
                        const vocabWord = new VocabularyWord(w);
                        return vocabWord.review && vocabWord.isDueForReview && vocabWord.isDueForReview();
                    });
                    document.getElementById('reviewBadge').textContent = `${dueWords.length} due`;
                });
            }
            
            // Attach delete button listener
            const deleteBtn = document.getElementById(`delete-word-${word.id}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.confirmDeleteWord(word);
                });
            }
        });
    },

    renderWordCard(word, index) {
        const vocabWord = new VocabularyWord(word); // Ensure it has all methods
        const displayWord = AppState.displayLanguage === 'spanish' ? vocabWord.spanish : vocabWord.english;
        const translation = AppState.displayLanguage === 'spanish' ? vocabWord.english : vocabWord.spanish;
        
        const masteryLevel = vocabWord.masteryLevel || 'review';
        const masteryClass = masteryLevel === 'completed' ? 'completed' : 'review';
        const masteryText = masteryLevel === 'completed' ? 'Mastered' : 'Review';
        
        const isReviewEnabled = vocabWord.review !== undefined ? vocabWord.review : true;
        
        return `
            <div class="vocab-card" id="vocab-card-${vocabWord.id}" style="animation-delay: ${index * 0.05}s">
                <label class="vocab-review-toggle vocab-review-toggle-top-right">
                    <span class="toggle-switch">
                        <input 
                            type="checkbox" 
                            id="review-toggle-${vocabWord.id}" 
                            ${isReviewEnabled ? 'checked' : ''}
                        >
                        <span class="toggle-slider"></span>
                    </span>
                </label>
                <button class="delete-btn vocab-delete-btn-bottom-right" id="delete-word-${vocabWord.id}" title="Delete word">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <div class="vocab-card-content">
                    <h3 class="vocab-word-primary">${this.escapeHtml(displayWord)}</h3>
                    <p class="vocab-word-secondary">${this.escapeHtml(translation)}</p>
                </div>
            </div>
        `;
    },

    renderConjugations(wordId, conjugations) {
        if (!conjugations) return '';
        
        const tenses = ['present', 'preterite', 'imperfect', 'conditional', 'subjunctive', 'future'];
        const persons = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];
        const irregularForms = conjugations.irregularForms || [];
        
        let html = `
            <div class="conjugations-container">
                <button class="conjugations-toggle" id="conj-toggle-${wordId}" aria-expanded="false">
                    <strong>Conjugations</strong>
                    <span class="toggle-icon">▼</span>
                </button>
                <div class="conjugations-content hidden" id="conj-content-${wordId}">
        `;
        
        tenses.forEach(tense => {
            if (!conjugations[tense]) return;
            
            html += `<div class="tense-group"><h4>${tense.charAt(0).toUpperCase() + tense.slice(1)}</h4><ul>`;
            persons.forEach(person => {
                const form = conjugations[tense][person];
                if (form) {
                    const isIrregular = irregularForms.includes(person);
                    const className = isIrregular ? 'irregular' : '';
                    html += `<li class="${className}"><strong>${person}:</strong> ${this.escapeHtml(form)}</li>`;
                }
            });
            html += '</ul></div>';
        });
        
        html += `
                </div>
            </div>
        `;
        return html;
    },

    renderQuiz() {
        AppState.updateQuizWords();
        const quizContent = document.getElementById('quizContent');
        const quizCard = document.getElementById('quizCard');
        const quizEmpty = document.getElementById('quizEmpty');
        
        if (AppState.quizWords.length === 0) {
            quizCard.classList.add('hidden');
            quizEmpty.classList.remove('hidden');
            return;
        }
        
        quizCard.classList.remove('hidden');
        quizEmpty.classList.add('hidden');
        
        if (AppState.currentQuizIndex >= AppState.quizWords.length) {
            AppState.currentQuizIndex = 0;
        }
        
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        const showWord = AppState.displayLanguage === 'spanish' ? currentWord.spanish : currentWord.english;
        const translation = AppState.displayLanguage === 'spanish' ? currentWord.english : currentWord.spanish;
        
        document.getElementById('quizWord').textContent = showWord;
        
        // Initialize translation container as expandable (hidden by default)
        const translationContainer = document.getElementById('quizTranslation');
        if (translationContainer) {
            translationContainer.innerHTML = '';
            translationContainer.classList.add('hidden');
        }
        
        // Initialize hint container as expandable (hidden by default)
        const hintContainer = document.getElementById('quizHint');
        if (hintContainer) {
            hintContainer.innerHTML = '';
            hintContainer.classList.add('hidden');
        }
        
        // Hide example sentences initially and render if available
        const exampleSentencesEl = document.getElementById('quizExampleSentences');
        if (exampleSentencesEl) {
            exampleSentencesEl.classList.add('hidden');
        }
        
        // Render example sentences (expandable)
        if (currentWord.exampleSentences && currentWord.exampleSentences.length > 0) {
            exampleSentencesEl.innerHTML = `
                <div class="quiz-expandable-container">
                    <button class="quiz-expandable-toggle" id="quiz-examples-toggle-${currentWord.id}" aria-expanded="false">
                        <strong>Example Sentences</strong>
                        <span class="toggle-icon">▼</span>
                    </button>
                    <div class="quiz-expandable-content hidden" id="quiz-examples-content-${currentWord.id}">
                        <ul>
                            ${currentWord.exampleSentences.map(s => {
                                // Handle newline format: split by \n or \\n
                                const parts = s.split(/\n|\\n/);
                                if (parts.length > 1) {
                                    return `<li>${this.escapeHtml(parts[0])}<br><span class="translation-line">${this.escapeHtml(parts[1])}</span></li>`;
                                } else {
                                    // Fallback for old format with parentheses on same line
                                    const match = s.match(/^(.+?)\s*\((.+?)\)$/);
                                    if (match) {
                                        return `<li>${this.escapeHtml(match[1])}<br><span class="translation-line">(${this.escapeHtml(match[2])})</span></li>`;
                                    }
                                    return `<li>${this.escapeHtml(s)}</li>`;
                                }
                            }).join('')}
                        </ul>
                    </div>
                </div>
            `;
            exampleSentencesEl.classList.add('hidden');
        } else {
            exampleSentencesEl.innerHTML = '';
            exampleSentencesEl.classList.add('hidden');
        }
        
        // Mnemonics removed - using hints instead
        
        // Always show reveal and hint buttons (they toggle expandable sections)
        document.getElementById('revealBtn').classList.remove('hidden');
        document.getElementById('hintBtn').classList.remove('hidden');
        document.getElementById('removeFromReviewBtn').classList.add('hidden');
        document.getElementById('nextQuizBtn').classList.add('hidden');
        
        // Update stats
        const stats = document.getElementById('quizStats');
        stats.textContent = `${AppState.currentQuizIndex + 1} / ${AppState.quizWords.length}`;
    },

    revealTranslation() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const translation = AppState.displayLanguage === 'spanish' ? currentWord.english : currentWord.spanish;
        const translationContainer = document.getElementById('quizTranslation');
        
        if (!translationContainer) return;
        
        // Check if already shown - if so, just toggle visibility
        const isCurrentlyHidden = translationContainer.classList.contains('hidden');
        
        if (isCurrentlyHidden) {
            // Show translation in expandable format
            translationContainer.innerHTML = `
                <div class="quiz-expandable-container">
                    <button class="quiz-expandable-toggle" id="quiz-translation-toggle-${currentWord.id}" aria-expanded="true">
                        <strong>Translation</strong>
                        <span class="toggle-icon">▲</span>
                    </button>
                    <div class="quiz-expandable-content" id="quiz-translation-content-${currentWord.id}">
                        <div class="quiz-translation-text">${this.escapeHtml(translation)}</div>
                    </div>
                </div>
            `;
            translationContainer.classList.remove('hidden');
            
            // Attach toggle listener for translation
            const translationToggle = document.getElementById(`quiz-translation-toggle-${currentWord.id}`);
            const translationContent = document.getElementById(`quiz-translation-content-${currentWord.id}`);
            if (translationToggle && translationContent) {
                translationToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const isExpanded = translationToggle.getAttribute('aria-expanded') === 'true';
                    translationToggle.setAttribute('aria-expanded', !isExpanded);
                    translationContent.classList.toggle('hidden');
                    const icon = translationToggle.querySelector('.toggle-icon');
                    if (icon) {
                        icon.textContent = isExpanded ? '▼' : '▲';
                    }
                });
            }
            
        } else {
            // Hide translation section
            translationContainer.classList.add('hidden');
        }
    },

    giveHint() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const vocabWord = new VocabularyWord(currentWord);
        const hintContainer = document.getElementById('quizHint');
        
        if (!hintContainer) return;
        
        // Check if already shown - if so, just toggle visibility
        const isCurrentlyHidden = hintContainer.classList.contains('hidden');
        
        if (isCurrentlyHidden) {
            if (vocabWord.hint && vocabWord.hint.length > 0) {
                // Use saved hints - display both hints in expandable format
                const hintsHtml = vocabWord.hint.map((hint, index) => 
                    `<p><strong>Hint ${index + 1}:</strong> ${this.escapeHtml(hint)}</p>`
                ).join('');
                
                hintContainer.innerHTML = `
                    <div class="quiz-expandable-container">
                        <button class="quiz-expandable-toggle" id="quiz-hint-toggle-${currentWord.id}" aria-expanded="true">
                            <strong>💡 Mnemonic Hints</strong>
                            <span class="toggle-icon">▲</span>
                        </button>
                        <div class="quiz-expandable-content" id="quiz-hint-content-${currentWord.id}">
                            ${hintsHtml}
                        </div>
                    </div>
                `;
                hintContainer.classList.remove('hidden');
            } else {
                // No hints available
                hintContainer.innerHTML = `
                    <div class="quiz-expandable-container">
                        <button class="quiz-expandable-toggle" id="quiz-hint-toggle-${currentWord.id}" aria-expanded="true">
                            <strong>💡 Mnemonic Hints</strong>
                            <span class="toggle-icon">▲</span>
                        </button>
                        <div class="quiz-expandable-content error" id="quiz-hint-content-${currentWord.id}">
                            <p>No hints available for this word.</p>
                        </div>
                    </div>
                `;
                hintContainer.classList.remove('hidden');
            }
            
            // Attach toggle listener
            const hintToggle = document.getElementById(`quiz-hint-toggle-${currentWord.id}`);
            const hintContent = document.getElementById(`quiz-hint-content-${currentWord.id}`);
            if (hintToggle && hintContent) {
                hintToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const isExpanded = hintToggle.getAttribute('aria-expanded') === 'true';
                    hintToggle.setAttribute('aria-expanded', !isExpanded);
                    hintContent.classList.toggle('hidden');
                    const icon = hintToggle.querySelector('.toggle-icon');
                    if (icon) {
                        icon.textContent = isExpanded ? '▼' : '▲';
                    }
                });
            }
        } else {
            // Hide hint section
            hintContainer.classList.add('hidden');
        }
    },

    showExampleSentences() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const exampleSentencesEl = document.getElementById('quizExampleSentences');
        if (!exampleSentencesEl) return;
        
        // Check if already shown - if so, just toggle visibility
        const isCurrentlyHidden = exampleSentencesEl.classList.contains('hidden');
        
        if (isCurrentlyHidden) {
            if (currentWord.exampleSentences && currentWord.exampleSentences.length > 0) {
                // Show example sentences in expandable format
                exampleSentencesEl.innerHTML = `
                    <div class="quiz-expandable-container">
                        <button class="quiz-expandable-toggle" id="quiz-examples-toggle-${currentWord.id}" aria-expanded="true">
                            <strong>Example Sentences</strong>
                            <span class="toggle-icon">▲</span>
                        </button>
                        <div class="quiz-expandable-content" id="quiz-examples-content-${currentWord.id}">
                            <ul>
                                ${currentWord.exampleSentences.map(s => {
                                    // Handle newline format: split by \n or \\n
                                    const parts = s.split(/\n|\\n/);
                                    if (parts.length > 1) {
                                        return `<li>${this.escapeHtml(parts[0])}<br><span class="translation-line">${this.escapeHtml(parts[1])}</span></li>`;
                                    } else {
                                        // Fallback for old format with parentheses on same line
                                        const match = s.match(/^(.+?)\s*\((.+?)\)$/);
                                        if (match) {
                                            return `<li>${this.escapeHtml(match[1])}<br><span class="translation-line">(${this.escapeHtml(match[2])})</span></li>`;
                                        }
                                        return `<li>${this.escapeHtml(s)}</li>`;
                                    }
                                }).join('')}
                            </ul>
                        </div>
                    </div>
                `;
                exampleSentencesEl.classList.remove('hidden');
                
                // Attach toggle listener
                const examplesToggle = document.getElementById(`quiz-examples-toggle-${currentWord.id}`);
                const examplesContent = document.getElementById(`quiz-examples-content-${currentWord.id}`);
                if (examplesToggle && examplesContent) {
                    examplesToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const isExpanded = examplesToggle.getAttribute('aria-expanded') === 'true';
                        examplesToggle.setAttribute('aria-expanded', !isExpanded);
                        examplesContent.classList.toggle('hidden');
                        const icon = examplesToggle.querySelector('.toggle-icon');
                        if (icon) {
                            icon.textContent = isExpanded ? '▼' : '▲';
                        }
                    });
                }
            } else {
                // No example sentences available
                exampleSentencesEl.innerHTML = `
                    <div class="quiz-expandable-container">
                        <button class="quiz-expandable-toggle" id="quiz-examples-toggle-${currentWord.id}" aria-expanded="true">
                            <strong>Example Sentences</strong>
                            <span class="toggle-icon">▲</span>
                        </button>
                        <div class="quiz-expandable-content error" id="quiz-examples-content-${currentWord.id}">
                            <p>No example sentences available for this word.</p>
                        </div>
                    </div>
                `;
                exampleSentencesEl.classList.remove('hidden');
                
                // Attach toggle listener
                const examplesToggle = document.getElementById(`quiz-examples-toggle-${currentWord.id}`);
                const examplesContent = document.getElementById(`quiz-examples-content-${currentWord.id}`);
                if (examplesToggle && examplesContent) {
                    examplesToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const isExpanded = examplesToggle.getAttribute('aria-expanded') === 'true';
                        examplesToggle.setAttribute('aria-expanded', !isExpanded);
                        examplesContent.classList.toggle('hidden');
                        const icon = examplesToggle.querySelector('.toggle-icon');
                        if (icon) {
                            icon.textContent = isExpanded ? '▼' : '▲';
                        }
                    });
                }
            }
        } else {
            // Hide example sentences section
            exampleSentencesEl.classList.add('hidden');
        }
    },

    removeFromReview() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        const words = Storage.updateWord(currentWord.id, { review: false });
        AppState.words = words.map(w => new VocabularyWord(w));
        AppState.updateQuizWords();
        
        if (AppState.currentQuizIndex >= AppState.quizWords.length) {
            AppState.currentQuizIndex = 0;
        }
        
        this.renderQuiz();
    },

    nextQuizWord() {
        AppState.currentQuizIndex = (AppState.currentQuizIndex + 1) % AppState.quizWords.length;
        this.renderQuiz();
    },

    confirmDeleteWord(word) {
        const displayWord = AppState.displayLanguage === 'spanish' ? word.spanish : word.english;
        const confirmed = confirm(`Are you sure you want to delete "${displayWord}"?\n\nThis action cannot be undone.`);
        
        if (confirmed) {
            const words = Storage.deleteWord(word.id);
            AppState.words = words.map(w => new VocabularyWord(w));
            AppState.updateQuizWords();
            this.render();
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    AppState.init();
    UI.init();
});

