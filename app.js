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
        this.review = data.review || false;
        this.exampleSentences = data.exampleSentences || [];
        this.mnemonics = data.mnemonics || [];
        this.partOfSpeech = data.partOfSpeech || '';
        this.conjugations = data.conjugations || null; // null if not a verb, object with tenses if verb
        this.hint = data.hint || ''; // Mnemonic hint for quiz mode
    }
}

// Storage Utilities
const Storage = {
    getWords() {
        const stored = localStorage.getItem('vocabularyWords');
        return stored ? JSON.parse(stored) : [];
    },

    saveWords(words) {
        localStorage.setItem('vocabularyWords', JSON.stringify(words));
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
            words[index] = { ...words[index], ...updates };
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
    async generateWordData(word) {
        // Check for API key: config > localStorage > window object
        const apiKey = CONFIG.OPENAI_API_KEY || localStorage.getItem('openai_api_key') || window.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found. Please enter your API key in the CONFIG section at the top of app.js, or use the settings section in the UI.');
        }

        const prompt = `You are a Spanish language learning assistant. Analyze the word "${word}" and provide a JSON response with the following structure:

{
  "detectedLanguage": "english" or "spanish",
  "spanish": "Spanish translation",
  "english": "English translation",
  "partOfSpeech": "noun/verb/adjective/adverb/etc",
  "exampleSentences": ["sentence 1", "sentence 2", "sentence 3", "sentence 4"],
  "mnemonics": ["mnemonic 1", "mnemonic 2", "mnemonic 3"],
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
- Mnemonics MUST ALWAYS be in English, regardless of whether the input word is Spanish or English. The mnemonics should help a native English speaker remember the Spanish word by creating associations, wordplay, or memory tricks in English.
- If the word is not a verb, set "isVerb" to false and "conjugations" to null.
- For irregular forms, list the specific person forms (e.g., ["yo", "tú"]) that are irregular.
- Provide 2-4 example sentences (always in Spanish with English translations on a new line) and 1-3 mnemonics (always in English).
Return ONLY valid JSON, no additional text.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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
            
            // Generate mnemonic hint for quiz mode
            let hint = '';
            try {
                hint = await this.generateMnemonicHint(
                    content.english,
                    content.spanish,
                    content.partOfSpeech
                );
            } catch (error) {
                console.error('Error generating hint during word creation:', error);
                // Continue without hint if generation fails
            }
            
            return {
                spanish: content.spanish,
                english: content.english,
                originalLanguage: content.detectedLanguage,
                partOfSpeech: content.partOfSpeech,
                exampleSentences: content.exampleSentences || [],
                mnemonics: content.mnemonics || [],
                conjugations: content.isVerb ? content.conjugations : null,
                hint: hint
            };
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    },

    async generateMnemonics(spanishWord, englishWord) {
        // Check for API key: config > localStorage > window object
        const apiKey = CONFIG.OPENAI_API_KEY || localStorage.getItem('openai_api_key') || window.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found.');
        }

        const prompt = `Generate 1-3 English mnemonics to help a native English speaker remember the Spanish word "${spanishWord}" (which means "${englishWord}" in English). Note that "${spanishWord}" is in Mexican Spanish.

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
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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
        // Check for API key: config > localStorage > window object
        const apiKey = CONFIG.OPENAI_API_KEY || localStorage.getItem('openai_api_key') || window.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found.');
        }

        const prompt = `Generate 2-4 example sentences in Spanish (Mexican Spanish) for the word "${spanishWord}" (which means "${englishWord}" in English). The word is a ${partOfSpeech || 'word'}.

The example sentences should:
- Be in Spanish (Mexican Spanish dialect)
- Demonstrate how to use the Spanish word "${spanishWord}" in context
- Be natural and practical examples
- Use Mexican Spanish vocabulary and expressions

Return a JSON object with this structure:
{
  "exampleSentences": ["sentence 1", "sentence 2", "sentence 3", "sentence 4"]
}

Return ONLY valid JSON, no additional text.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
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
            
            return content.exampleSentences || [];
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    },

    async generateMnemonicHint(englishWord, spanishWord, partOfSpeech) {
        // Check for API key: config > localStorage > window object
        const apiKey = CONFIG.OPENAI_API_KEY || localStorage.getItem('openai_api_key') || window.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found.');
        }

        const prompt = `Generate a mnemonic hint in English to help an English speaker remember the Spanish word "${spanishWord}" (which means "${englishWord}" in English and is a ${partOfSpeech || 'word'}).

IMPORTANT:
- Do NOT mention the actual Spanish word "${spanishWord}" in your hint
- The hint should be in English
- Focus on the PRONUNCIATION of the Spanish word - create a memory trick based on how "${spanishWord}" sounds when pronounced in Spanish
- Use English words that sound similar to the Spanish pronunciation to create associations
- Make it creative and memorable
- The hint should help someone recall the Spanish word by thinking about its pronunciation, not its meaning
- Example: If the Spanish word sounds like an English word or phrase, use that similarity

Return a JSON object with this structure:
{
  "hint": "your mnemonic hint here based on Spanish pronunciation"
}

Return ONLY valid JSON, no additional text.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a helpful Spanish language learning assistant. Always respond with valid JSON only.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.8,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'OpenAI API error');
            }

            const data = await response.json();
            const content = JSON.parse(data.choices[0].message.content);
            
            return content.hint || '';
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
        this.words = Storage.getWords();
        this.loadSettings();
        this.updateQuizWords();
    },

    loadSettings() {
        const savedLang = localStorage.getItem('displayLanguage');
        const savedReviewOnly = localStorage.getItem('reviewOnly');
        if (savedLang) this.displayLanguage = savedLang;
        if (savedReviewOnly !== null) this.reviewOnly = savedReviewOnly === 'true';
    },

    saveSettings() {
        localStorage.setItem('displayLanguage', this.displayLanguage);
        localStorage.setItem('reviewOnly', this.reviewOnly.toString());
    },

    updateQuizWords() {
        this.quizWords = this.words.filter(w => w.review);
    },

    getFilteredWords() {
        let filtered = [...this.words];
        if (this.reviewOnly) {
            filtered = filtered.filter(w => w.review);
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
            const savedKey = localStorage.getItem('openai_api_key');
            if (savedKey) {
                window.OPENAI_API_KEY = savedKey;
                apiKeyInput.value = savedKey;
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
                localStorage.setItem('openai_api_key', key);
                alert('API key saved successfully!');
            } else {
                alert('Please enter an API key.');
            }
        });

        // Homepage controls
        document.getElementById('reviewOnlyToggle').addEventListener('change', (e) => {
            AppState.reviewOnly = e.target.checked;
            AppState.saveSettings();
            this.render();
        });

        document.getElementById('displayLanguageToggle').addEventListener('change', (e) => {
            AppState.displayLanguage = e.target.value;
            AppState.saveSettings();
            this.render();
        });

        // Add word
        document.getElementById('addWordBtn').addEventListener('click', () => this.handleAddWord());
        document.getElementById('newWordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddWord();
        });

        // Update mnemonics
        document.getElementById('updateMnemonicsBtn').addEventListener('click', () => this.handleUpdateMnemonics());
        
        // Update example sentences (with translations)
        document.getElementById('updateExampleSentencesBtn').addEventListener('click', () => this.handleUpdateExampleSentences());
        
        // Update hints
        document.getElementById('updateHintsBtn').addEventListener('click', () => this.handleUpdateHints());

        // Quiz controls
        document.getElementById('quizLanguageToggle').addEventListener('change', (e) => {
            AppState.displayLanguage = e.target.value;
            AppState.saveSettings();
            this.renderQuiz();
        });

        document.getElementById('revealBtn').addEventListener('click', () => this.revealTranslation());
        document.getElementById('hintBtn').addEventListener('click', () => this.giveHint());
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

    async handleAddWord() {
        const input = document.getElementById('newWordInput');
        const inputText = input.value.trim();
        const statusEl = document.getElementById('addWordStatus');
        
        if (!inputText) {
            statusEl.textContent = 'Please enter a word or words.';
            statusEl.className = 'status-message error';
            return;
        }

        // Handle "to [verb]" pattern - treat as single verb entry
        const toVerbPattern = /^to\s+([a-záéíóúñü]+)$/i;
        const toVerbMatch = inputText.match(toVerbPattern);
        
        let words;
        if (toVerbMatch && inputText.split(/[\s,;:]+/).length === 2) {
            // If it's "to [verb]" pattern and only two words, treat as single verb
            words = [toVerbMatch[1]]; // Extract just the verb
        } else {
            // Split input into individual words, removing punctuation and extra spaces
            words = inputText
                .split(/[\s,;:]+/)
                .map(w => {
                    // Remove "to " prefix if present at the start of a word
                    w = w.replace(/^to\s+/i, '');
                    // Remove punctuation
                    return w.replace(/[^\wáéíóúñüÁÉÍÓÚÑÜ]/g, '');
                })
                .filter(w => w.length > 0);
        }

        if (words.length === 0) {
            statusEl.textContent = 'No valid words found.';
            statusEl.className = 'status-message error';
            return;
        }

        const btn = document.getElementById('addWordBtn');
        btn.disabled = true;
        btn.textContent = `Adding ${words.length} word${words.length > 1 ? 's' : ''}...`;
        
        const addedWords = [];
        const errors = [];

        // Process each word
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            statusEl.textContent = `Processing "${word}" (${i + 1}/${words.length})...`;
            statusEl.className = 'status-message info';

            try {
                const wordData = await OpenAI.generateWordData(word);
                const vocabWord = new VocabularyWord({
                    ...wordData,
                    review: true // New words start as review words
                });

                AppState.words = Storage.addWord(vocabWord);
                addedWords.push({ spanish: wordData.spanish, english: wordData.english });
            } catch (error) {
                console.error(`Error adding word "${word}":`, error);
                errors.push({ word, error: error.message });
            }
        }

        input.value = '';
        
        // Show results
        if (addedWords.length > 0 && errors.length === 0) {
            if (addedWords.length === 1) {
                statusEl.textContent = `Successfully added "${addedWords[0].spanish}" / "${addedWords[0].english}"!`;
            } else {
                statusEl.textContent = `Successfully added ${addedWords.length} words!`;
            }
            statusEl.className = 'status-message success';
            this.render();
        } else if (addedWords.length > 0 && errors.length > 0) {
            statusEl.textContent = `Added ${addedWords.length} word(s), ${errors.length} error(s). Check console for details.`;
            statusEl.className = 'status-message error';
            this.render();
        } else {
            statusEl.textContent = `Error: Failed to add words. ${errors.length > 0 ? errors[0].error : 'Unknown error'}`;
            statusEl.className = 'status-message error';
        }
        
        btn.disabled = false;
        btn.textContent = 'Add Word';
        
        setTimeout(() => {
            if (statusEl.textContent.includes('Successfully')) {
                statusEl.textContent = '';
                statusEl.className = 'status-message';
            }
        }, 5000);
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
                AppState.words = Storage.updateWord(word.id, { mnemonics });
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
                AppState.words = Storage.updateWord(word.id, { exampleSentences });
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
                // Generate hint if it doesn't exist
                if (!word.hint) {
                    const hint = await OpenAI.generateMnemonicHint(
                        word.english,
                        word.spanish,
                        word.partOfSpeech
                    );
                    AppState.words = Storage.updateWord(word.id, { hint });
                    updated++;
                } else {
                    // Skip if hint already exists
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

        // Update toggle states
        document.getElementById('reviewOnlyToggle').checked = AppState.reviewOnly;
        document.getElementById('displayLanguageToggle').value = AppState.displayLanguage;

        // Render vocabulary cards
        const filteredWords = AppState.getFilteredWords();
        const grid = document.getElementById('vocabularyGrid');
        
        if (filteredWords.length === 0) {
            grid.innerHTML = '<p class="empty-message">No words found. Add some words to get started!</p>';
            return;
        }

        grid.innerHTML = filteredWords.map(word => this.renderWordCard(word)).join('');
        
        // Attach event listeners to review toggles, conjugation toggles, and card flip
        filteredWords.forEach(word => {
            // Attach card flip listener
            const cardFlip = document.getElementById(`card-flip-${word.id}`);
            if (cardFlip) {
                cardFlip.addEventListener('click', (e) => {
                    // Don't flip if clicking on buttons, toggles, or labels
                    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) {
                        return;
                    }
                    cardFlip.classList.toggle('flipped');
                });
            }
            
            // Attach review toggle listeners (front and back)
            const toggleFront = document.getElementById(`review-toggle-front-${word.id}`);
            if (toggleFront) {
                toggleFront.addEventListener('change', (e) => {
                    e.stopPropagation();
                    AppState.words = Storage.updateWord(word.id, { review: e.target.checked });
                    AppState.updateQuizWords();
                    this.render();
                });
            }
            
            const toggle = document.getElementById(`review-toggle-${word.id}`);
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    AppState.words = Storage.updateWord(word.id, { review: e.target.checked });
                    AppState.updateQuizWords();
                    this.render();
                });
            }
            
            // Attach conjugation toggle listener
            if (word.conjugations) {
                const conjToggle = document.getElementById(`conj-toggle-${word.id}`);
                const conjContent = document.getElementById(`conj-content-${word.id}`);
                if (conjToggle && conjContent) {
                    conjToggle.addEventListener('click', () => {
                        const isExpanded = conjToggle.getAttribute('aria-expanded') === 'true';
                        conjToggle.setAttribute('aria-expanded', !isExpanded);
                        conjContent.classList.toggle('hidden');
                        const icon = conjToggle.querySelector('.toggle-icon');
                        if (icon) {
                            icon.textContent = isExpanded ? '▼' : '▲';
                        }
                    });
                }
            }
            
            // Attach example sentences toggle listener
            if (word.exampleSentences && word.exampleSentences.length > 0) {
                const examplesToggle = document.getElementById(`examples-toggle-${word.id}`);
                const examplesContent = document.getElementById(`examples-content-${word.id}`);
                if (examplesToggle && examplesContent) {
                    examplesToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
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
            
            // Attach mnemonics toggle listener
            if (word.mnemonics && word.mnemonics.length > 0) {
                const mnemonicsToggle = document.getElementById(`mnemonics-toggle-${word.id}`);
                const mnemonicsContent = document.getElementById(`mnemonics-content-${word.id}`);
                if (mnemonicsToggle && mnemonicsContent) {
                    mnemonicsToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isExpanded = mnemonicsToggle.getAttribute('aria-expanded') === 'true';
                        mnemonicsToggle.setAttribute('aria-expanded', !isExpanded);
                        mnemonicsContent.classList.toggle('hidden');
                        const icon = mnemonicsToggle.querySelector('.toggle-icon');
                        if (icon) {
                            icon.textContent = isExpanded ? '▼' : '▲';
                        }
                    });
                }
            }
            
            // Attach delete button listeners (front and back)
            const deleteBtn = document.getElementById(`delete-word-${word.id}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.confirmDeleteWord(word);
                });
            }
            
            const deleteBtnBack = document.getElementById(`delete-word-back-${word.id}`);
            if (deleteBtnBack) {
                deleteBtnBack.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.confirmDeleteWord(word);
                });
            }
        });
    },

    renderWordCard(word) {
        const displayWord = AppState.displayLanguage === 'spanish' ? word.spanish : word.english;
        const translation = AppState.displayLanguage === 'spanish' ? word.english : word.spanish;
        
        // Check if verb has irregular forms
        const hasIrregularForms = word.conjugations && word.conjugations.irregularForms && word.conjugations.irregularForms.length > 0;
        const irregularIndicator = hasIrregularForms ? ' <span class="irregular-indicator">(irregular)</span>' : '';
        
        let conjugationsHtml = '';
        if (word.conjugations) {
            conjugationsHtml = this.renderConjugations(word.id, word.conjugations);
        }

        return `
            <div class="word-card-flip-container">
                <div class="word-card-flip" id="card-flip-${word.id}">
                    <div class="word-card-front">
                        <div class="word-card-front-content">
                            <label class="review-toggle-label-front">
                                <input 
                                    type="checkbox" 
                                    id="review-toggle-front-${word.id}" 
                                    class="review-toggle-switch"
                                    ${word.review ? 'checked' : ''}
                                >
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Review</span>
                            </label>
                            <h3 class="word-text-front">${this.escapeHtml(displayWord)}${irregularIndicator}</h3>
                            <button class="delete-word-btn-front" id="delete-word-${word.id}" title="Delete word">
                                🗑️
                            </button>
                        </div>
                    </div>
                    <div class="word-card-back">
                        <div class="word-card-back-content">
                            <label class="review-toggle-label-back">
                                <input 
                                    type="checkbox" 
                                    id="review-toggle-${word.id}" 
                                    class="review-toggle-switch"
                                    ${word.review ? 'checked' : ''}
                                >
                                <span class="toggle-slider"></span>
                                <span class="toggle-text">Review</span>
                            </label>
                            <button class="delete-word-btn-back" id="delete-word-back-${word.id}" title="Delete word">
                                🗑️
                            </button>
                            <div class="word-card-body">
                                <h3 class="word-text-back">${this.escapeHtml(displayWord)}${irregularIndicator}</h3>
                                <div class="translation-back">
                                    <strong>Translation:</strong>
                                    <div class="translation-text-large">${this.escapeHtml(translation)}</div>
                                </div>
                                ${word.partOfSpeech ? `<p class="part-of-speech"><strong>Part of Speech:</strong> ${this.escapeHtml(word.partOfSpeech)}</p>` : ''}
                                
                                ${word.exampleSentences.length > 0 ? `
                                    <div class="example-sentences">
                                        <button class="expandable-toggle" id="examples-toggle-${word.id}" aria-expanded="false">
                                            <strong>Example Sentences:</strong>
                                            <span class="toggle-icon">▼</span>
                                        </button>
                                        <div class="expandable-content hidden" id="examples-content-${word.id}">
                                            <ul>
                                                ${word.exampleSentences.map(s => {
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
                                ` : ''}
                                
                                ${word.mnemonics.length > 0 ? `
                                    <div class="mnemonics">
                                        <button class="expandable-toggle" id="mnemonics-toggle-${word.id}" aria-expanded="false">
                                            <strong>Mnemonics:</strong>
                                            <span class="toggle-icon">▼</span>
                                        </button>
                                        <div class="expandable-content hidden" id="mnemonics-content-${word.id}">
                                            <ul>
                                                ${word.mnemonics.map(m => `<li>${this.escapeHtml(m)}</li>`).join('')}
                                            </ul>
                                        </div>
                                    </div>
                                ` : ''}
                                
                                ${conjugationsHtml}
                            </div>
                        </div>
                    </div>
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
        document.getElementById('quizTranslation').textContent = translation;
        document.getElementById('quizTranslation').classList.add('hidden');
        
        // Render example sentences (expandable)
        const exampleSentencesEl = document.getElementById('quizExampleSentences');
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
        
        // Render mnemonics (expandable)
        const mnemonicsEl = document.getElementById('quizMnemonics');
        if (currentWord.mnemonics && currentWord.mnemonics.length > 0) {
            mnemonicsEl.innerHTML = `
                <div class="quiz-expandable-container">
                    <button class="quiz-expandable-toggle" id="quiz-mnemonics-toggle-${currentWord.id}" aria-expanded="false">
                        <strong>Mnemonics</strong>
                        <span class="toggle-icon">▼</span>
                    </button>
                    <div class="quiz-expandable-content hidden" id="quiz-mnemonics-content-${currentWord.id}">
                        <ul>
                            ${currentWord.mnemonics.map(m => `<li>${this.escapeHtml(m)}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
            mnemonicsEl.classList.add('hidden');
        } else {
            mnemonicsEl.innerHTML = '';
            mnemonicsEl.classList.add('hidden');
        }
        
        document.getElementById('revealBtn').classList.remove('hidden');
        document.getElementById('hintBtn').classList.remove('hidden');
        document.getElementById('removeFromReviewBtn').classList.add('hidden');
        document.getElementById('nextQuizBtn').classList.add('hidden');
        
        // Update stats
        const stats = document.getElementById('quizStats');
        stats.textContent = `${AppState.currentQuizIndex + 1} / ${AppState.quizWords.length}`;
    },

    revealTranslation() {
        document.getElementById('quizTranslation').classList.remove('hidden');
        document.getElementById('quizExampleSentences').classList.remove('hidden');
        document.getElementById('quizMnemonics').classList.remove('hidden');
        
        // Attach event listeners to expandable sections
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        
        // Example sentences toggle
        const examplesToggle = document.getElementById(`quiz-examples-toggle-${currentWord.id}`);
        const examplesContent = document.getElementById(`quiz-examples-content-${currentWord.id}`);
        if (examplesToggle && examplesContent) {
            // Remove existing listeners by cloning
            const newToggle = examplesToggle.cloneNode(true);
            examplesToggle.parentNode.replaceChild(newToggle, examplesToggle);
            
            newToggle.addEventListener('click', () => {
                const isExpanded = newToggle.getAttribute('aria-expanded') === 'true';
                newToggle.setAttribute('aria-expanded', !isExpanded);
                examplesContent.classList.toggle('hidden');
                const icon = newToggle.querySelector('.toggle-icon');
                if (icon) {
                    icon.textContent = isExpanded ? '▼' : '▲';
                }
            });
        }
        
        // Mnemonics toggle
        const mnemonicsToggle = document.getElementById(`quiz-mnemonics-toggle-${currentWord.id}`);
        const mnemonicsContent = document.getElementById(`quiz-mnemonics-content-${currentWord.id}`);
        if (mnemonicsToggle && mnemonicsContent) {
            // Remove existing listeners by cloning
            const newToggle = mnemonicsToggle.cloneNode(true);
            mnemonicsToggle.parentNode.replaceChild(newToggle, mnemonicsToggle);
            
            newToggle.addEventListener('click', () => {
                const isExpanded = newToggle.getAttribute('aria-expanded') === 'true';
                newToggle.setAttribute('aria-expanded', !isExpanded);
                mnemonicsContent.classList.toggle('hidden');
                const icon = newToggle.querySelector('.toggle-icon');
                if (icon) {
                    icon.textContent = isExpanded ? '▼' : '▲';
                }
            });
        }
        
        document.getElementById('revealBtn').classList.add('hidden');
        document.getElementById('hintBtn').classList.add('hidden');
        document.getElementById('removeFromReviewBtn').classList.remove('hidden');
        document.getElementById('nextQuizBtn').classList.remove('hidden');
    },

    giveHint() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        const hintEl = document.getElementById('quizHint');
        
        if (currentWord.hint) {
            // Use saved hint
            hintEl.innerHTML = `
                <div class="quiz-hint-content">
                    <strong>💡 Mnemonic Hint:</strong>
                    <p>${this.escapeHtml(currentWord.hint)}</p>
                </div>
            `;
            hintEl.classList.remove('hidden');
        } else {
            // No hint available
            hintEl.innerHTML = `
                <div class="quiz-hint-content error">
                    <p>No hint available for this word.</p>
                </div>
            `;
            hintEl.classList.remove('hidden');
        }
    },

    removeFromReview() {
        const currentWord = AppState.quizWords[AppState.currentQuizIndex];
        AppState.words = Storage.updateWord(currentWord.id, { review: false });
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
            AppState.words = Storage.deleteWord(word.id);
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

