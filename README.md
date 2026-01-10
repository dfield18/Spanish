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

### Local Development

1. **Set OpenAI API Key**

   You need to provide your OpenAI API key. You can do this in two ways:

   **Option 1: Edit CONFIG in app.js**
   Open `app.js` and add your API key to the `CONFIG` object:
   ```javascript
   const CONFIG = {
       OPENAI_API_KEY: 'sk-your-api-key-here'
   };
   ```

   **Option 2: Browser Console (for testing)**
   Open the browser console and run:
   ```javascript
   window.OPENAI_API_KEY = "your-api-key-here";
   ```

   **Option 3: Local Storage (via Settings UI)**
   Use the settings section in the application UI to save your API key.

2. **Open the Application**

   Simply open `index.html` in your web browser. For best results, use a local server:

   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js (http-server)
   npx http-server

   # Then navigate to http://localhost:8000
   ```

### Vercel Deployment

1. **Deploy to Vercel**

   ```bash
   # Install Vercel CLI (if not already installed)
   npm i -g vercel

   # Deploy
   vercel
   ```

2. **Set Environment Variable**

   After deployment, set the `OPENAI_API_KEY` environment variable in Vercel:

   - Go to your project dashboard on [vercel.com](https://vercel.com)
   - Navigate to **Settings** → **Environment Variables**
   - Add a new variable:
     - **Name**: `OPENAI_API_KEY`
     - **Value**: Your OpenAI API key (e.g., `sk-...`)
     - **Environment**: Production, Preview, Development (select all)
   - Click **Save**

3. **Redeploy**

   After setting the environment variable, redeploy your application:
   ```bash
   vercel --prod
   ```

   Or trigger a redeploy from the Vercel dashboard.

**Note**: When deployed on Vercel, the application automatically uses a serverless function proxy to keep your API key secure server-side. The API key is never exposed to the client-side code.

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

