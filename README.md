# Spanish Vocabulary Memorizer

A web application for memorizing and reviewing Spanish vocabulary with AI-powered word generation, conjugations, and quiz functionality.

## Features

- **Vocabulary Management**: Add Spanish/English words with translations, example sentences, and mnemonics
- **AI-Powered Generation**: Uses OpenAI API to automatically generate translations, sentences, mnemonics, and verb conjugations
- **Review System**: Mark words for review and filter to show only review words
- **Quiz Mode**: Test yourself on words marked for review
- **Verb Conjugations**: Automatic detection and display of verb conjugations with irregular forms highlighted
- **Local Storage**: All data persists locally in your browser

## Setup

1. **Set OpenAI API Key**

   You need to provide your OpenAI API key. You can do this in two ways:

   **Option 1: Environment Variable (for local development)**
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

   **Option 2: Browser Console (for testing)**
   Open the browser console and run:
   ```javascript
   window.OPENAI_API_KEY = "your-api-key-here";
   ```

2. **Open the Application**

   Simply open `index.html` in your web browser. For best results, use a local server:

   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js (http-server)
   npx http-server

   # Then navigate to http://localhost:8000
   ```

## Usage

### Adding Words

1. Type a word (English or Spanish) in the input field
2. Click "Add Word" or press Enter
3. The app will automatically:
   - Detect the language
   - Generate the translation
   - Create 2-4 example sentences
   - Generate 1-3 mnemonics
   - If it's a verb, generate conjugations for all tenses
   - Mark irregular forms

### Managing Vocabulary

- **Toggle Review**: Check/uncheck the "Review" checkbox on any word card
- **Filter Review Words**: Use the "Show review words only" toggle
- **Change Display Language**: Toggle between Spanish and English display

### Quiz Mode

1. Click the "Quiz" button in the navigation
2. Words marked for review will be shown one at a time
3. Click "Reveal Translation" to see the answer
4. Use "Remove from Review" to mark words you've mastered
5. Click "Next Word" to continue

## Data Model

Each vocabulary word includes:
- Spanish word
- English translation
- Original input language
- Review flag (boolean)
- 2-4 example sentences
- 1-3 mnemonics
- Part of speech
- Verb conjugations (if applicable):
  - Present
  - Preterite (past)
  - Imperfect
  - Conditional
  - Subjunctive
  - Future
  - Irregular forms (underlined in red)

## Browser Compatibility

Works in all modern browsers that support:
- ES6+ JavaScript
- LocalStorage API
- Fetch API

## Notes

- All data is stored locally in your browser's localStorage
- The app uses OpenAI's GPT-4o-mini model for word generation
- Irregular verb forms are automatically detected and highlighted
- Settings (display language, review filter) are persisted across sessions

