// Configuration - Set your OpenAI API key here for local development
// IMPORTANT: Never commit this file with your API key to version control!
const CONFIG = {
    OPENAI_API_KEY: '' // Enter your OpenAI API key here, e.g., 'sk-...'
};

// Status labels
const STATUS_LABELS = {
    'review-now': 'Review Now',
    'check-later': 'Check Later',
    'archived': 'Archived'
};

// Data Model
class VocabularyWord {
    constructor(data) {
        this.id = data.id || Date.now().toString();
        // Convert words to lowercase by default
        this.spanish = data.spanish ? String(data.spanish).toLowerCase().trim() : '';
        this.english = data.english ? String(data.english).toLowerCase().trim() : '';
        this.originalLanguage = data.originalLanguage || 'english'; // 'english' or 'spanish'
        this.review = data.review !== undefined ? data.review : true; // Default to review for new words
        this.reviewNow = data.reviewNow !== undefined ? data.reviewNow : false; // Review Now status
        this.archived = data.archived !== undefined ? data.archived : false; // Archive status
        this.checkLater = data.checkLater !== undefined ? data.checkLater : false; // Check later status
        
        // New status system
        this.isActive = data.isActive !== undefined ? data.isActive : true; // Active toggle
        // Determine status from existing flags or use provided status
        if (data.status) {
            this.status = data.status; // 'review-now' | 'check-later' | 'archived'
        } else {
            // Migrate from old flags to new status system
            if (data.archived) {
                this.status = 'archived';
            } else if (data.checkLater) {
                this.status = 'check-later';
            } else if (data.reviewNow) {
                this.status = 'review-now';
            } else {
                this.status = 'review-now'; // Default status
            }
        }
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

    // Check if a word already exists (case-insensitive comparison)
    wordExists(newWord) {
        const words = this.getWords();
        const newSpanish = newWord.spanish?.toLowerCase().trim();
        const newEnglish = newWord.english?.toLowerCase().trim();
        
        return words.some(existingWord => {
            const existingSpanish = existingWord.spanish?.toLowerCase().trim();
            const existingEnglish = existingWord.english?.toLowerCase().trim();
            
            // Check if Spanish matches OR English matches (case-insensitive)
            return (newSpanish && existingSpanish && newSpanish === existingSpanish) ||
                   (newEnglish && existingEnglish && newEnglish === existingEnglish);
        });
    },

    addWord(word) {
        // Check for duplicates before adding
        if (this.wordExists(word)) {
            return null; // Return null to indicate duplicate
        }
        
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
            // Convert spanish and english to lowercase if they're being updated
            if (updates.spanish !== undefined) {
                updatedWord.spanish = String(updates.spanish).toLowerCase().trim();
            }
            if (updates.english !== undefined) {
                updatedWord.english = String(updates.english).toLowerCase().trim();
            }
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
- For VERBS: The example sentences MUST use the verb in different tenses and conjugations (not just the infinitive form). Use various tenses like present, preterite, imperfect, future, conditional, and subjunctive. Use different persons (yo, tú, él/ella, nosotros, ellos/ellas) to demonstrate the conjugations. Each sentence should showcase a different conjugated form of the verb. Do NOT use the infinitive form in the sentences - always use conjugated forms.
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

    async generateExampleSentences(spanishWord, englishWord, partOfSpeech, conjugations = null) {
        // Escape words to prevent issues with special characters
        const escapedSpanish = String(spanishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        const escapedEnglish = String(englishWord).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        
        const isVerb = partOfSpeech === 'verb' || conjugations !== null;
        let conjugationsInfo = '';
        
        if (isVerb && conjugations) {
            // Format conjugations for the prompt
            const conjugationsStr = JSON.stringify(conjugations, null, 2);
            conjugationsInfo = `\n\nThis is a VERB. Here are its conjugations:\n${conjugationsStr}\n\nIMPORTANT: For verbs, the example sentences MUST use the verb in different tenses and conjugations (not just the infinitive form). Use various tenses like present, preterite, imperfect, future, conditional, and subjunctive. Use different persons (yo, tú, él/ella, nosotros, ellos/ellas) to demonstrate the conjugations. Each sentence should showcase a different conjugated form of the verb.`;
        }
        
        const prompt = `Generate 2-4 example sentences in Spanish (Mexican Spanish) for the word "${escapedSpanish}" (which means "${escapedEnglish}" in English). The word is a ${partOfSpeech || 'word'}.${conjugationsInfo}

The example sentences should:
- Be in Spanish (Mexican Spanish dialect)
- Demonstrate how to use the Spanish word "${escapedSpanish}" in context
- Be natural and practical examples
- Use Mexican Spanish vocabulary and expressions${isVerb ? '\n- For verbs: Use different tenses and conjugations (present, preterite, imperfect, future, conditional, subjunctive) with different persons (yo, tú, él/ella, nosotros, ellos/ellas). Do NOT use the infinitive form in the sentences - always use conjugated forms.' : ''}

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
    viewFilter: 'reviewNow', // 'all', 'active', 'archive', 'checkLater', or 'reviewNow'
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
            const savedViewFilter = localStorage.getItem('viewFilter');
            if (savedLang) this.displayLanguage = savedLang;
            if (savedReviewOnly !== null) this.reviewOnly = savedReviewOnly === 'true';
            if (savedViewFilter) this.viewFilter = savedViewFilter;
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
            localStorage.setItem('viewFilter', this.viewFilter);
        } catch (error) {
            console.error('Error saving settings to localStorage:', error);
        }
    },

    updateQuizWords() {
        this.quizWords = this.words.filter(w => {
            const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
            // Only include words that are enabled for review AND due for review AND status is review-now
            return vocabWord.review && vocabWord.isDueForReview && vocabWord.isDueForReview() && vocabWord.status === 'review-now';
        });
    },

    getFilteredWords() {
        let filtered = [...this.words];
        
        // Filter based on view filter dropdown
        if (this.viewFilter === 'active') {
            // Show only active words (isActive = true)
            filtered = filtered.filter(w => {
                const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
                return vocabWord.isActive !== false; // Default to true if undefined
            });
        } else if (this.viewFilter === 'archive') {
            // Show only archived words
            filtered = filtered.filter(w => {
                const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
                return vocabWord.status === 'archived';
            });
        } else if (this.viewFilter === 'checkLater') {
            // Show only check later words
            filtered = filtered.filter(w => {
                const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
                return vocabWord.status === 'check-later';
            });
        } else if (this.viewFilter === 'reviewNow') {
            // Show only review now words
            filtered = filtered.filter(w => {
                const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
                return vocabWord.status === 'review-now';
            });
        }
        // If viewFilter is 'all', show all words (no filtering)
        
        if (this.reviewOnly) {
            filtered = filtered.filter(w => {
                const vocabWord = w instanceof VocabularyWord ? w : new VocabularyWord(w);
                // Show only words that have review enabled and are not archived
                return vocabWord.review === true && vocabWord.status !== 'archived';
            });
        }
        return filtered;
    }
};

// UI Components
const UI = {
    init() {
        this.setupEventListeners();
        // Ensure correct initial view state
        this.showView(AppState.currentView || 'home');
    },

    setupEventListeners() {
        // Logo/Brand click to go home
        const headerLogo = document.getElementById('headerLogo');
        if (headerLogo) {
            headerLogo.addEventListener('click', (e) => {
                e.preventDefault();
                this.showView('home');
            });
        }
        
        // Navigation - Desktop and Mobile
        document.getElementById('homeBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.showView('home');
        });
        document.getElementById('quizBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.showView('quiz');
        });
        
        // Bottom Navigation (Mobile)
        const bottomHomeBtn = document.getElementById('bottomHomeBtn');
        const bottomQuizBtn = document.getElementById('bottomQuizBtn');
        if (bottomHomeBtn) {
            bottomHomeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showView('home');
            });
        }
        if (bottomQuizBtn) {
            bottomQuizBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showView('quiz');
            });
        }

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

        // Review toggle (Desktop only)
        const reviewOnlyToggle = document.getElementById('reviewOnlyToggle');
        
        const handleReviewToggle = (e) => {
            const isChecked = e.target.checked;
            AppState.reviewOnly = isChecked;
            AppState.saveSettings();
            
            if (reviewOnlyToggle) reviewOnlyToggle.checked = isChecked;
            
            this.render();
        };
        
        if (reviewOnlyToggle) {
            reviewOnlyToggle.addEventListener('change', handleReviewToggle);
        }

        // View filter dropdown (Desktop)
        const viewFilterDropdown = document.getElementById('viewFilterDropdown');
        if (viewFilterDropdown) {
            viewFilterDropdown.addEventListener('change', (e) => {
                AppState.viewFilter = e.target.value;
                AppState.saveSettings();
                this.syncViewDropdowns();
                this.render();
            });
        }
        
        // View filter dropdown (Mobile)
        const viewFilterDropdownMobile = document.getElementById('viewFilterDropdownMobile');
        if (viewFilterDropdownMobile) {
            viewFilterDropdownMobile.addEventListener('change', (e) => {
                AppState.viewFilter = e.target.value;
                AppState.saveSettings();
                this.syncViewDropdowns();
                this.render();
            });
        }

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
        const conjugationsBtn = document.getElementById('conjugationsBtn');
        if (conjugationsBtn) {
            conjugationsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showConjugations();
            });
        }
        const quizReviewToggle = document.getElementById('quizReviewToggle');
        if (quizReviewToggle) {
            quizReviewToggle.addEventListener('change', (e) => {
                const currentWord = AppState.quizWords[AppState.currentQuizIndex];
                if (!currentWord) return;
                const updates = { review: e.target.checked };
                // If enabling review, clear archived and checkLater flags
                if (e.target.checked) {
                    updates.archived = false;
                    updates.checkLater = false;
                }
                const words = Storage.updateWord(currentWord.id, updates);
                AppState.words = words.map(w => new VocabularyWord(w));
                AppState.updateQuizWords();
                this.renderQuiz();
            });
        }
        
        const quizReviewNowToggle = document.getElementById('quizReviewNowToggle');
        if (quizReviewNowToggle) {
            quizReviewNowToggle.addEventListener('change', (e) => {
                const currentWord = AppState.quizWords[AppState.currentQuizIndex];
                if (!currentWord) return;
                const words = Storage.updateWord(currentWord.id, { reviewNow: e.target.checked });
                AppState.words = words.map(w => new VocabularyWord(w));
                AppState.updateQuizWords();
                this.renderQuiz();
            });
        }
        
        document.getElementById('removeFromReviewBtn').addEventListener('click', () => this.removeFromReview());
        document.getElementById('archiveWordBtn').addEventListener('click', () => this.archiveWordFromQuiz());
        document.getElementById('checkLaterBtn').addEventListener('click', () => this.checkLaterFromQuiz());
        document.getElementById('deleteWordBtn').addEventListener('click', () => this.deleteWordFromQuiz());
        const prevQuizBtn = document.getElementById('prevQuizBtn');
        if (prevQuizBtn) {
            prevQuizBtn.addEventListener('click', () => this.prevQuizWord());
        }
        document.getElementById('nextQuizBtn').addEventListener('click', () => this.nextQuizWord());
    },

    showView(view) {
        AppState.currentView = view;
        
        // Get all elements
        const homeView = document.getElementById('homeView');
        const quizView = document.getElementById('quizView');
        const homeBtn = document.getElementById('homeBtn');
        const quizBtn = document.getElementById('quizBtn');
        const bottomHomeBtn = document.getElementById('bottomHomeBtn');
        const bottomQuizBtn = document.getElementById('bottomQuizBtn');
        
        // Remove active from all views
        if (homeView) homeView.classList.remove('active');
        if (quizView) quizView.classList.remove('active');
        
        // Remove active from all navigation buttons (desktop and mobile)
        [homeBtn, quizBtn, bottomHomeBtn, bottomQuizBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove('active');
                btn.className = btn.className.replace(/\bactive\b/g, '').trim();
            }
        });
        
        // Also remove from nav-tab class elements
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Then add active to the correct elements
        if (view === 'home') {
            if (homeView) homeView.classList.add('active');
            if (homeBtn) homeBtn.classList.add('active');
            if (bottomHomeBtn) bottomHomeBtn.classList.add('active');
            // Ensure quiz buttons are NOT active
            if (quizBtn) quizBtn.classList.remove('active');
            if (bottomQuizBtn) bottomQuizBtn.classList.remove('active');
            this.render();
        } else if (view === 'quiz') {
            if (quizView) quizView.classList.add('active');
            if (quizBtn) quizBtn.classList.add('active');
            if (bottomQuizBtn) bottomQuizBtn.classList.add('active');
            // Ensure home buttons are NOT active
            if (homeBtn) homeBtn.classList.remove('active');
            if (bottomHomeBtn) bottomHomeBtn.classList.remove('active');
            AppState.updateQuizWords();
            this.renderQuiz();
        }
    },
    
    syncViewDropdowns() {
        // Sync desktop and mobile dropdowns
        const viewFilterDropdown = document.getElementById('viewFilterDropdown');
        const viewFilterDropdownMobile = document.getElementById('viewFilterDropdownMobile');
        if (viewFilterDropdown) viewFilterDropdown.value = AppState.viewFilter;
        if (viewFilterDropdownMobile) viewFilterDropdownMobile.value = AppState.viewFilter;
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
        
        // Split input by commas, newlines, or spaces
        // Filter out empty strings and trim each word
        const wordsToAdd = inputText
            .split(/[,\n\s]+/)
            .map(w => w.trim())
            .filter(w => w.length > 0);

        if (wordsToAdd.length === 0) {
            statusEl.textContent = 'Please enter at least one word.';
            statusEl.className = 'status-message error';
            btn.disabled = false;
            btn.innerHTML = '<svg class="plus-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }, 3000);
            return;
        }

        statusEl.textContent = `Processing ${wordsToAdd.length} word${wordsToAdd.length > 1 ? 's' : ''}...`;
        statusEl.className = 'status-message info';

        const addedWords = [];
        const errors = [];
        const skipped = [];

        try {
            // Process each word sequentially to avoid overwhelming the API
            for (let i = 0; i < wordsToAdd.length; i++) {
                const wordText = wordsToAdd[i];
                statusEl.textContent = `Processing word ${i + 1} of ${wordsToAdd.length}: "${wordText}"...`;
                
                try {
                    // Use OpenAI to detect language and handle typos
                    const wordData = await OpenAI.generateWordData(wordText);
                    
                    const vocabWord = new VocabularyWord({
                        ...wordData,
                        masteryLevel: 'review',
                        review: true,
                        reviewCount: 0,
                        streak: 0,
                        nextReview: new Date()
                    });

                    // Check for duplicates before adding
                    if (Storage.wordExists(vocabWord)) {
                        skipped.push({
                            spanish: vocabWord.spanish,
                            english: vocabWord.english,
                            input: wordText
                        });
                        continue;
                    }

                    const result = Storage.addWord(vocabWord);
                    if (result) {
                        addedWords.push(vocabWord);
                    } else {
                        skipped.push({
                            spanish: vocabWord.spanish,
                            english: vocabWord.english,
                            input: wordText
                        });
                    }
                } catch (error) {
                    console.error(`Error adding word "${wordText}":`, error);
                    errors.push({ word: wordText, error: error.message });
                }
            }

            // Reload all words from storage
            AppState.words = Storage.getWords().map(w => new VocabularyWord(w));
            
            // Update UI
            input.value = '';
            input.focus();
            this.render();
            
            // Add animation to newly added words
            addedWords.forEach(vocabWord => {
                const newCard = document.getElementById(`vocab-card-${vocabWord.id}`);
                if (newCard) {
                    newCard.classList.add('new-word');
                    setTimeout(() => {
                        newCard.classList.remove('new-word');
                    }, 1000);
                }
            });
            
            // Show success/error message
            let statusMessage = '';
            if (addedWords.length > 0) {
                if (addedWords.length === 1) {
                    statusMessage = `Added: "${addedWords[0].spanish}" / "${addedWords[0].english}"`;
                } else {
                    statusMessage = `Successfully added ${addedWords.length} word${addedWords.length > 1 ? 's' : ''}`;
                }
                
                if (skipped.length > 0) {
                    statusMessage += `, ${skipped.length} duplicate${skipped.length > 1 ? 's' : ''} skipped`;
                }
                
                if (errors.length > 0) {
                    statusMessage += `, ${errors.length} failed`;
                }
                
                statusEl.className = errors.length > 0 ? 'status-message error' : 'status-message success';
            } else if (skipped.length > 0 && errors.length === 0) {
                statusMessage = `All ${skipped.length} word${skipped.length > 1 ? 's were' : ' was'} already in your vocabulary`;
                statusEl.className = 'status-message info';
            } else if (errors.length > 0) {
                statusMessage = `Failed to add ${errors.length} word${errors.length > 1 ? 's' : ''}`;
                statusEl.className = 'status-message error';
            }
            
            statusEl.textContent = statusMessage;
            
            // Clear status message after delay
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }, addedWords.length > 0 ? 3000 : 5000);
        } catch (error) {
            console.error(`Error processing words:`, error);
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

            // Check for duplicates before adding
            if (Storage.wordExists(vocabWord)) {
                statusEl.textContent = `"${vocabWord.spanish}" / "${vocabWord.english}" is already in your vocabulary`;
                statusEl.className = 'status-message info';
                btn.disabled = false;
                btn.textContent = 'Add Word';
                return;
            }

            const words = Storage.addWord(vocabWord);
            if (words) {
                AppState.words = words.map(w => new VocabularyWord(w));
                
                statusEl.textContent = `Successfully added "${vocabWord.spanish}" / "${vocabWord.english}"!`;
                statusEl.className = 'status-message success';
            } else {
                statusEl.textContent = `"${vocabWord.spanish}" / "${vocabWord.english}" is already in your vocabulary`;
                statusEl.className = 'status-message info';
                btn.disabled = false;
                btn.textContent = 'Add Word';
                return;
            }
            
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
                    word.partOfSpeech,
                    word.conjugations || null
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
                        word.partOfSpeech,
                        word.conjugations || null
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

        // Update toggle state (Desktop only)
        const reviewOnlyToggle = document.getElementById('reviewOnlyToggle');
        if (reviewOnlyToggle) reviewOnlyToggle.checked = AppState.reviewOnly;
        
        // Sync view dropdowns
        this.syncViewDropdowns();
        
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
        
        // Update review badge count (only words that are enabled for review AND due AND status is review-now)
        const dueWords = AppState.words.filter(w => {
            const vocabWord = new VocabularyWord(w);
            return vocabWord.review && vocabWord.isDueForReview && vocabWord.isDueForReview() && vocabWord.status === 'review-now';
        });
        // Update review badge (Desktop only)
        const reviewBadge = document.getElementById('reviewBadge');
        const badgeText = `${dueWords.length} due`;
        if (reviewBadge) reviewBadge.textContent = badgeText;

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
            // Attach active toggle listener (Desktop)
            const activeToggle = document.getElementById(`active-toggle-${word.id}`);
            if (activeToggle) {
                activeToggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const words = Storage.updateWord(word.id, { isActive: e.target.checked });
                    AppState.words = words.map(w => new VocabularyWord(w));
                    this.render();
                });
            }
            
            // Attach active button listener (Mobile)
            const activeBtn = document.getElementById(`active-btn-${word.id}`);
            if (activeBtn) {
                activeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newActiveState = !word.isActive;
                    const words = Storage.updateWord(word.id, { isActive: newActiveState });
                    AppState.words = words.map(w => new VocabularyWord(w));
                    this.render();
                });
            }
            
            // Attach status button listeners
            const statusButtons = [
                { id: `status-review-now-${word.id}`, status: 'review-now' },
                { id: `status-check-later-${word.id}`, status: 'check-later' },
                { id: `status-archived-${word.id}`, status: 'archived' }
            ];
            
            statusButtons.forEach(({ id, status }) => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Update status and sync old flags for backward compatibility
                        const updates = { 
                            status: status,
                            reviewNow: status === 'review-now',
                            checkLater: status === 'check-later',
                            archived: status === 'archived',
                            review: status !== 'archived' // Keep review enabled unless archived
                        };
                        const words = Storage.updateWord(word.id, updates);
                        AppState.words = words.map(w => new VocabularyWord(w));
                        AppState.updateQuizWords();
                        // Update the review badge count
                        const dueWords = AppState.words.filter(w => {
                            const vocabWord = new VocabularyWord(w);
                            return vocabWord.review && vocabWord.isDueForReview && vocabWord.isDueForReview() && vocabWord.status !== 'archived' && vocabWord.status !== 'check-later';
                        });
                        // Update review badge - sync both desktop and mobile
                        const reviewBadge = document.getElementById('reviewBadge');
                        const reviewBadgeMobile = document.getElementById('reviewBadgeMobile');
                        const badgeText = `${dueWords.length} due`;
                        if (reviewBadge) reviewBadge.textContent = badgeText;
                        if (reviewBadgeMobile) reviewBadgeMobile.textContent = badgeText;
                        this.render();
                    });
                }
            });
            
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
        const spanishWord = vocabWord.spanish;
        const englishWord = vocabWord.english;
        const currentStatus = vocabWord.status || 'review-now';
        const isActive = vocabWord.isActive !== undefined ? vocabWord.isActive : true;
        
        // Determine which status button should be active
        const isReviewNow = currentStatus === 'review-now';
        const isCheckLater = currentStatus === 'check-later';
        const isArchived = currentStatus === 'archived';
        
        return `
            <div class="vocab-card ${!isActive ? 'vocab-card-inactive' : ''}" id="vocab-card-${vocabWord.id}" style="animation-delay: ${index * 0.05}s">
                <div class="vocab-card-top-row">
                    <div class="vocab-word-pair">
                        <span class="language-badge language-badge-spanish">ES</span>
                        <span class="vocab-word-primary">${this.escapeHtml(spanishWord)}</span>
                        <span class="word-separator">→</span>
                        <span class="language-badge language-badge-english">EN</span>
                        <span class="vocab-word-secondary">${this.escapeHtml(englishWord)}</span>
                    </div>
                    <div class="vocab-card-top-actions">
                        <div class="vocab-active-toggle-wrapper">
                            <span class="vocab-active-label">Active</span>
                            <label class="vocab-active-toggle">
                                <span class="toggle-switch">
                                    <input 
                                        type="checkbox" 
                                        id="active-toggle-${vocabWord.id}" 
                                        ${isActive ? 'checked' : ''}
                                    >
                                    <span class="toggle-slider"></span>
                                </span>
                            </label>
                        </div>
                        <button class="vocab-delete-btn" id="delete-word-${vocabWord.id}" title="Delete word">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="vocab-card-bottom-row">
                    <button class="vocab-status-btn vocab-status-btn-review-now ${isReviewNow ? 'vocab-status-btn-active' : ''}" id="status-review-now-${vocabWord.id}" data-status="review-now">
                        <svg class="status-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        ${STATUS_LABELS['review-now']}
                    </button>
                    <button class="vocab-status-btn vocab-status-btn-check-later ${isCheckLater ? 'vocab-status-btn-active' : ''}" id="status-check-later-${vocabWord.id}" data-status="check-later">
                        <svg class="status-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2V6M12 18V22M6 12H2M22 12H18M19.07 19.07L16.24 16.24M19.07 4.93L16.24 7.76M4.93 19.07L7.76 16.24M4.93 4.93L7.76 7.76M12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        ${STATUS_LABELS['check-later']}
                    </button>
                    <button class="vocab-status-btn vocab-status-btn-archived ${isArchived ? 'vocab-status-btn-active' : ''}" id="status-archived-${vocabWord.id}" data-status="archived">
                        <svg class="status-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6H20V20H4V6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <rect x="7" y="8" width="4" height="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            <rect x="9" y="8.5" width="4" height="6" stroke="currentColor" stroke-width="1.5" fill="none"/>
                            <path d="M11 8.5L13 8.5L13 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        ${STATUS_LABELS['archived']}
                    </button>
                    <button class="vocab-active-btn vocab-active-btn-mobile ${isActive ? 'vocab-active-btn-active' : ''}" id="active-btn-${vocabWord.id}" data-word-id="${vocabWord.id}">
                        Active
                    </button>
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
            const prevBtn = document.getElementById('prevQuizBtn');
            const nextBtn = document.getElementById('nextQuizBtn');
            if (prevBtn) prevBtn.classList.add('hidden');
            if (nextBtn) nextBtn.classList.add('hidden');
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
        
        // Update quiz toggles
        const currentVocabWord = new VocabularyWord(currentWord);
        const quizReviewToggle = document.getElementById('quizReviewToggle');
        const quizReviewNowToggle = document.getElementById('quizReviewNowToggle');
        if (quizReviewToggle) {
            quizReviewToggle.checked = currentVocabWord.review || false;
        }
        if (quizReviewNowToggle) {
            quizReviewNowToggle.checked = currentVocabWord.reviewNow || false;
        }
        
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
        
        // Show/hide conjugations group based on whether word is a verb
        const conjugationsGroup = document.getElementById('quizConjugationsGroup');
        const conjugationsBtn = document.getElementById('conjugationsBtn');
        const conjugationsContainer = document.getElementById('quizConjugations');
        
        if (currentVocabWord.conjugations) {
            // Show conjugations group
            if (conjugationsGroup) conjugationsGroup.style.display = 'block';
            
            // Check if there are irregular forms and style button text accordingly
            const irregularForms = currentVocabWord.conjugations.irregularForms || [];
            if (irregularForms.length > 0 && conjugationsBtn) {
                conjugationsBtn.style.color = 'hsl(0, 70%, 50%)'; // Red color
            } else if (conjugationsBtn) {
                conjugationsBtn.style.color = ''; // Reset to default
            }
            
            // Initialize conjugations container
            if (conjugationsContainer) {
                conjugationsContainer.innerHTML = '';
                conjugationsContainer.classList.add('hidden');
            }
        } else {
            // Hide conjugations group if not a verb
            if (conjugationsGroup) conjugationsGroup.style.display = 'none';
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
        // Show icon buttons (remove from review and delete) - they're always visible
        // Show navigation buttons in the quiz actions
        const prevBtn = document.getElementById('prevQuizBtn');
        const nextBtn = document.getElementById('nextQuizBtn');
        
        if (prevBtn) {
            prevBtn.classList.remove('hidden');
            prevBtn.style.display = 'block';
            // Show previous word position
            if (AppState.quizWords.length > 1) {
                const prevIndex = AppState.currentQuizIndex === 0 ? AppState.quizWords.length - 1 : AppState.currentQuizIndex - 1;
                prevBtn.textContent = `Previous Word (${prevIndex + 1} / ${AppState.quizWords.length})`;
            } else {
                prevBtn.textContent = 'Previous Word';
            }
        }
        
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            nextBtn.style.display = 'block';
            // Ensure button text shows current position
            if (AppState.quizWords.length > 1) {
                const nextIndex = (AppState.currentQuizIndex + 1) % AppState.quizWords.length;
                if (nextIndex === 0 && AppState.currentQuizIndex === AppState.quizWords.length - 1) {
                    nextBtn.textContent = 'Next Word (Back to Start)';
                } else {
                    nextBtn.textContent = `Next Word (${nextIndex + 1} / ${AppState.quizWords.length})`;
                }
            } else {
                nextBtn.textContent = 'Next Word';
            }
        }
        
        // Update stats
        const stats = document.getElementById('quizStats');
        if (stats) {
            stats.textContent = `${AppState.currentQuizIndex + 1} / ${AppState.quizWords.length}`;
        }
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
            
            // Scroll quiz card to top of page
            this.scrollQuizCardToTop();
            
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
                            <button class="regenerate-hints-btn" id="regenerate-hints-${currentWord.id}" title="Regenerate hints using OpenAI">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 4V10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M23 20V14H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                Regenerate Hints
                            </button>
                        </div>
                    </div>
                `;
                hintContainer.classList.remove('hidden');
                
                // Attach regenerate button listener
                const regenerateBtn = document.getElementById(`regenerate-hints-${currentWord.id}`);
                if (regenerateBtn) {
                    regenerateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.regenerateHints(currentWord.id);
                    });
                }
                
                // Scroll quiz card to top of page
                this.scrollQuizCardToTop();
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
                            <button class="regenerate-hints-btn" id="regenerate-hints-${currentWord.id}" title="Generate hints using OpenAI">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 4V10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M23 20V14H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                Generate Hints
                            </button>
                        </div>
                    </div>
                `;
                hintContainer.classList.remove('hidden');
                
                // Attach regenerate button listener
                const regenerateBtn = document.getElementById(`regenerate-hints-${currentWord.id}`);
                if (regenerateBtn) {
                    regenerateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.regenerateHints(currentWord.id);
                    });
                }
                
                // Scroll quiz card to top of page
                this.scrollQuizCardToTop();
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

    async regenerateHints(wordId) {
        // Find the word in the words array
        const wordIndex = AppState.words.findIndex(w => w.id === wordId);
        if (wordIndex === -1) return;
        
        const word = AppState.words[wordIndex];
        const vocabWord = new VocabularyWord(word);
        
        // Get the regenerate button and disable it
        const regenerateBtn = document.getElementById(`regenerate-hints-${wordId}`);
        if (regenerateBtn) {
            regenerateBtn.disabled = true;
            regenerateBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-dashoffset="32">
                        <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite"/>
                        <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite"/>
                    </circle>
                </svg>
                Generating...
            `;
        }
        
        try {
            // Generate new hints using OpenAI
            const newHints = await OpenAI.generateMnemonicHint(
                vocabWord.english,
                vocabWord.spanish,
                vocabWord.partOfSpeech
            );
            
            if (newHints && newHints.length > 0) {
                // Update the word with new hints
                const updatedWords = Storage.updateWord(wordId, { hint: newHints });
                AppState.words = updatedWords.map(w => new VocabularyWord(w));
                
                // Update the quiz words array if this word is in it
                AppState.updateQuizWords();
                
                // Refresh the hint display - ensure container is visible first
                const hintContainer = document.getElementById('quizHint');
                if (hintContainer) {
                    hintContainer.classList.remove('hidden');
                }
                this.giveHint();
            } else {
                throw new Error('No hints generated');
            }
        } catch (error) {
            console.error('Error regenerating hints:', error);
            alert('Failed to regenerate hints. Please check your OpenAI API key and try again.');
            
            // Re-enable button
            if (regenerateBtn) {
                regenerateBtn.disabled = false;
                regenerateBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 4V10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M23 20V14H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Regenerate Hints
                `;
            }
        }
    },

    showConjugations() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const vocabWord = new VocabularyWord(currentWord);
        if (!vocabWord.conjugations) return;
        
        const conjugationsEl = document.getElementById('quizConjugations');
        if (!conjugationsEl) return;
        
        // Check if already shown - if so, just toggle visibility
        const isCurrentlyHidden = conjugationsEl.classList.contains('hidden');
        
        if (isCurrentlyHidden) {
            const conjugations = vocabWord.conjugations;
            const tenses = ['present', 'preterite', 'imperfect', 'conditional', 'subjunctive', 'future'];
            const persons = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];
            const irregularForms = conjugations.irregularForms || [];
            
            let conjugationsHtml = '';
            tenses.forEach(tense => {
                if (!conjugations[tense]) return;
                
                conjugationsHtml += `<div class="tense-group"><h4>${tense.charAt(0).toUpperCase() + tense.slice(1)}</h4><ul>`;
                persons.forEach(person => {
                    const form = conjugations[tense][person];
                    if (form) {
                        const isIrregular = irregularForms.includes(person);
                        const className = isIrregular ? 'irregular' : '';
                        conjugationsHtml += `<li class="${className}"><strong>${person}:</strong> ${this.escapeHtml(form)}</li>`;
                    }
                });
                conjugationsHtml += '</ul></div>';
            });
            
            // Just show the conjugations content directly without nested expandable container
            conjugationsEl.innerHTML = `
                <div class="quiz-expandable-content" id="quiz-conjugations-content-${currentWord.id}">
                    ${conjugationsHtml}
                </div>
            `;
            conjugationsEl.classList.remove('hidden');
            
            // Scroll quiz card to top of page
            this.scrollQuizCardToTop();
        } else {
            // Toggle visibility - just hide/show the container
            conjugationsEl.classList.add('hidden');
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
                                ${currentWord.exampleSentences.map((s, idx) => {
                                    // Handle newline format: split by \n or \\n
                                    const parts = s.split(/\n|\\n/);
                                    let spanishSentence = '';
                                    let englishTranslation = '';
                                    
                                    if (parts.length > 1) {
                                        spanishSentence = parts[0];
                                        englishTranslation = parts[1];
                                    } else {
                                        // Fallback for old format with parentheses on same line
                                        const match = s.match(/^(.+?)\s*\((.+?)\)$/);
                                        if (match) {
                                            spanishSentence = match[1];
                                            englishTranslation = `(${match[2]})`;
                                        } else {
                                            spanishSentence = s;
                                        }
                                    }
                                    
                                    // Make words clickable in Spanish sentence
                                    const clickableSentence = this.makeWordsClickable(spanishSentence, `example-${currentWord.id}-${idx}`);
                                    
                                    return `<li>${clickableSentence}<br><span class="translation-line">${this.escapeHtml(englishTranslation)}</span></li>`;
                                }).join('')}
                            </ul>
                        </div>
                    </div>
                `;
                exampleSentencesEl.classList.remove('hidden');
                
                // Scroll quiz card to top of page
                this.scrollQuizCardToTop();
                
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
                
                // Attach click handlers to clickable words
                setTimeout(() => {
                    const examplesContent = document.getElementById(`quiz-examples-content-${currentWord.id}`);
                    if (examplesContent) {
                        this.attachWordClickHandlersToContainer(examplesContent);
                    } else {
                        // Fallback: try with prefix
                        this.attachWordClickHandlers(`example-${currentWord.id}`);
                    }
                }, 200);
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
                
                // Scroll quiz card to top of page
                this.scrollQuizCardToTop();
                
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

    archiveWordFromQuiz() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const words = Storage.updateWord(currentWord.id, { archived: true, review: false });
        AppState.words = words.map(w => new VocabularyWord(w));
        AppState.updateQuizWords();
        
        // Adjust current index if needed
        if (AppState.currentQuizIndex >= AppState.quizWords.length) {
            AppState.currentQuizIndex = Math.max(0, AppState.quizWords.length - 1);
        }
        
        // If no more words, go back to home view
        if (AppState.quizWords.length === 0) {
            this.showView('home');
        } else {
            this.renderQuiz();
        }
    },

    checkLaterFromQuiz() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const words = Storage.updateWord(currentWord.id, { checkLater: true, review: false });
        AppState.words = words.map(w => new VocabularyWord(w));
        AppState.updateQuizWords();
        
        // Adjust current index if needed
        if (AppState.currentQuizIndex >= AppState.quizWords.length) {
            AppState.currentQuizIndex = Math.max(0, AppState.quizWords.length - 1);
        }
        
        // If no more words, go back to home view
        if (AppState.quizWords.length === 0) {
            this.showView('home');
        } else {
            this.renderQuiz();
        }
    },

    deleteWordFromQuiz() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        const displayWord = AppState.displayLanguage === 'spanish' ? currentWord.spanish : currentWord.english;
        const confirmed = confirm(`Are you sure you want to delete "${displayWord}"?\n\nThis action cannot be undone.`);
        
        if (confirmed) {
            const words = Storage.deleteWord(currentWord.id);
            AppState.words = words.map(w => new VocabularyWord(w));
            AppState.updateQuizWords();
            
            // Adjust current index if needed
            if (AppState.currentQuizIndex >= AppState.quizWords.length) {
                AppState.currentQuizIndex = Math.max(0, AppState.quizWords.length - 1);
            }
            
            // If no more words, go back to home view
            if (AppState.quizWords.length === 0) {
                this.showView('home');
            } else {
                this.renderQuiz();
            }
        }
    },

    collapseAllExpandedBoxes() {
        // Collapse any expanded boxes for the current word
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        if (!currentWord) return;
        
        // Collapse translation
        const translationContent = document.getElementById(`quiz-translation-content-${currentWord.id}`);
        const translationToggle = document.getElementById(`quiz-translation-toggle-${currentWord.id}`);
        if (translationContent && translationToggle) {
            translationContent.classList.add('hidden');
            translationToggle.setAttribute('aria-expanded', 'false');
            const translationIcon = translationToggle.querySelector('.toggle-icon');
            if (translationIcon) translationIcon.textContent = '▼';
        }
        
        // Collapse hints
        const hintContent = document.getElementById(`quiz-hint-content-${currentWord.id}`);
        const hintToggle = document.getElementById(`quiz-hint-toggle-${currentWord.id}`);
        if (hintContent && hintToggle) {
            hintContent.classList.add('hidden');
            hintToggle.setAttribute('aria-expanded', 'false');
            const hintIcon = hintToggle.querySelector('.toggle-icon');
            if (hintIcon) hintIcon.textContent = '▼';
        }
        
        // Collapse example sentences
        const examplesContent = document.getElementById(`quiz-examples-content-${currentWord.id}`);
        const examplesToggle = document.getElementById(`quiz-examples-toggle-${currentWord.id}`);
        if (examplesContent && examplesToggle) {
            examplesContent.classList.add('hidden');
            examplesToggle.setAttribute('aria-expanded', 'false');
            const examplesIcon = examplesToggle.querySelector('.toggle-icon');
            if (examplesIcon) examplesIcon.textContent = '▼';
        }
        
        // Collapse conjugations
        const conjugationsEl = document.getElementById('quizConjugations');
        if (conjugationsEl) {
            conjugationsEl.classList.add('hidden');
        }
    },

    prevQuizWord() {
        this.collapseAllExpandedBoxes();
        
        // Move to previous word (wrap around to end if at beginning)
        if (AppState.currentQuizIndex === 0) {
            AppState.currentQuizIndex = AppState.quizWords.length - 1;
        } else {
            AppState.currentQuizIndex--;
        }
        this.renderQuiz();
    },

    nextQuizWord() {
        this.collapseAllExpandedBoxes();
        
        // Move to next word
        AppState.currentQuizIndex = (AppState.currentQuizIndex + 1) % AppState.quizWords.length;
        this.renderQuiz();
    },

    checkLaterFromHome(word) {
        const words = Storage.updateWord(word.id, { checkLater: true, review: false });
        AppState.words = words.map(w => new VocabularyWord(w));
        AppState.updateQuizWords();
        this.render();
    },

    archiveWordFromHome(word) {
        const words = Storage.updateWord(word.id, { archived: true, review: false });
        AppState.words = words.map(w => new VocabularyWord(w));
        AppState.updateQuizWords();
        this.render();
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

    scrollQuizCardToTop() {
        const quizCard = document.getElementById('quizCard');
        const quizHeader = document.querySelector('.quiz-header');
        
        if (quizCard) {
            // Get the quiz card's position relative to the document
            const cardRect = quizCard.getBoundingClientRect();
            const currentScrollY = window.scrollY || window.pageYOffset;
            
            // Calculate scroll position to put quiz card at the very top
            // If quiz header exists, scroll past it to hide it
            let targetScrollY = currentScrollY + cardRect.top;
            
            if (quizHeader) {
                // Scroll to position where quiz card is at top, hiding the quiz header
                const headerRect = quizHeader.getBoundingClientRect();
                const headerBottom = currentScrollY + headerRect.bottom;
                targetScrollY = headerBottom;
            }
            
            // Smooth scroll to position quiz card at the very top
            window.scrollTo({
                top: targetScrollY,
                behavior: 'smooth'
            });
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    makeWordsClickable(sentence, prefix) {
        // Split sentence into words, preserving spaces and punctuation
        // Match Spanish words (including accented characters) and punctuation separately
        const wordPattern = /[\wáéíóúñüÁÉÍÓÚÑÜ]+/g;
        let result = '';
        let lastIndex = 0;
        let wordIndex = 0;
        let match;
        
        while ((match = wordPattern.exec(sentence)) !== null) {
            // Add text before the word (spaces, punctuation)
            result += this.escapeHtml(sentence.slice(lastIndex, match.index));
            
            // Add the clickable word
            const word = match[0];
            const wordId = `${prefix}-word-${wordIndex}`;
            result += `<span class="clickable-word" data-word="${this.escapeHtml(word)}" id="${wordId}">${this.escapeHtml(word)}</span>`;
            
            lastIndex = match.index + word.length;
            wordIndex++;
        }
        
        // Add remaining text after last word
        result += this.escapeHtml(sentence.slice(lastIndex));
        
        return result;
    },

    attachWordClickHandlersToContainer(container) {
        const clickableWords = container.querySelectorAll('.clickable-word');
        const self = this;
        
        if (clickableWords.length === 0) {
            console.warn('No clickable words found in container');
            return;
        }
        
        clickableWords.forEach(wordSpan => {
            // Skip if already has handlers attached
            if (wordSpan.dataset.handlersAttached === 'true') {
                return;
            }
            wordSpan.dataset.handlersAttached = 'true';
            
            let touchStartTime = 0;
            let touchTimer = null;
            let clickCount = 0;
            let clickTimer = null;
            
            // Single click handler - detect double click manually
            wordSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                clickCount++;
                
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                    }, 300); // 300ms window for double click
                } else if (clickCount === 2) {
                    clearTimeout(clickTimer);
                    clickCount = 0;
                    e.preventDefault();
                    const word = wordSpan.getAttribute('data-word');
                    if (word) {
                        self.handleWordClick(word);
                    }
                }
            });
            
            // Double-click handler for desktop (backup)
            wordSpan.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(clickTimer);
                clickCount = 0;
                const word = wordSpan.getAttribute('data-word');
                if (word) {
                    self.handleWordClick(word);
                }
            });
            
            // Touch handlers for mobile
            wordSpan.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                touchStartTime = Date.now();
                touchTimer = setTimeout(() => {
                    const word = wordSpan.getAttribute('data-word');
                    if (word) {
                        e.preventDefault();
                        self.handleWordClick(word);
                    }
                }, 500); // 500ms long press
            }, { passive: false });
            
            wordSpan.addEventListener('touchend', (e) => {
                e.stopPropagation();
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            });
            
            wordSpan.addEventListener('touchmove', (e) => {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            });
        });
    },

    attachWordClickHandlers(prefix) {
        // Try multiple selector strategies
        let clickableWords = document.querySelectorAll(`[id^="${prefix}-word-"].clickable-word`);
        
        // Fallback: select by class if ID selector doesn't work
        if (clickableWords.length === 0) {
            const container = document.getElementById(`quiz-examples-content-${prefix.replace('example-', '')}`);
            if (container) {
                return this.attachWordClickHandlersToContainer(container);
            }
        }
        
        const self = this; // Preserve context
        
        if (clickableWords.length === 0) {
            console.warn(`No clickable words found with prefix: ${prefix}`);
            return;
        }
        
        clickableWords.forEach(wordSpan => {
            // Skip if already has handlers attached
            if (wordSpan.dataset.handlersAttached === 'true') {
                return;
            }
            wordSpan.dataset.handlersAttached = 'true';
            
            let touchStartTime = 0;
            let touchTimer = null;
            let clickCount = 0;
            let clickTimer = null;
            
            // Single click handler - detect double click manually
            wordSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                clickCount++;
                
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                    }, 300); // 300ms window for double click
                } else if (clickCount === 2) {
                    clearTimeout(clickTimer);
                    clickCount = 0;
                    e.preventDefault();
                    const word = wordSpan.getAttribute('data-word');
                    if (word) {
                        self.handleWordClick(word);
                    }
                }
            });
            
            // Double-click handler for desktop (backup)
            wordSpan.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(clickTimer);
                clickCount = 0;
                const word = wordSpan.getAttribute('data-word');
                if (word) {
                    self.handleWordClick(word);
                }
            });
            
            // Touch handlers for mobile
            wordSpan.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                touchStartTime = Date.now();
                touchTimer = setTimeout(() => {
                    const word = wordSpan.getAttribute('data-word');
                    if (word) {
                        e.preventDefault();
                        self.handleWordClick(word);
                    }
                }, 500); // 500ms long press
            }, { passive: false });
            
            wordSpan.addEventListener('touchend', (e) => {
                e.stopPropagation();
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            });
            
            wordSpan.addEventListener('touchmove', (e) => {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            });
        });
    },

    async handleWordClick(word) {
        // Check if word already exists
        const wordExists = Storage.wordExists(word);
        if (wordExists) {
            const confirmed = confirm(`The word "${word}" already exists in your vocabulary. Do you want to add it anyway?`);
            if (!confirmed) return;
        } else {
            const confirmed = confirm(`Add "${word}" as a new word?`);
            if (!confirmed) return;
        }
        
        // Add the word using the existing quick add functionality
        try {
            const wordData = await OpenAI.generateWordData(word);
            const newWord = new VocabularyWord({
                spanish: wordData.spanish,
                english: wordData.english,
                originalLanguage: wordData.originalLanguage,
                partOfSpeech: wordData.partOfSpeech,
                exampleSentences: wordData.exampleSentences || [],
                conjugations: wordData.conjugations || null,
                hint: wordData.hint || []
            });
            
            const words = Storage.addWord(newWord);
            if (words) {
                AppState.words = words.map(w => new VocabularyWord(w));
                AppState.updateQuizWords();
                
                // Show success message
                const statusEl = document.getElementById('quickAddStatus');
                if (statusEl) {
                    statusEl.textContent = `Added "${word}" successfully!`;
                    statusEl.className = 'status-message success';
                    setTimeout(() => {
                        statusEl.textContent = '';
                        statusEl.className = 'status-message';
                    }, 3000);
                }
                
                // Re-render if on homepage
                if (AppState.currentView === 'home') {
                    this.render();
                }
            }
        } catch (error) {
            console.error('Error adding word:', error);
            alert(`Failed to add "${word}". Please try again.`);
        }
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    AppState.init();
    UI.init();
});

