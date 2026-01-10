// Vercel Serverless Function for proxying OpenAI API requests
// This keeps the API key server-side and secure
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get API key from environment variable
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable in Vercel.' });
    }

    try {
        const { endpoint, body } = req.body;

        // Validate endpoint
        if (!endpoint || typeof endpoint !== 'string') {
            return res.status(400).json({ error: 'Invalid endpoint' });
        }

        // Only allow OpenAI API endpoints
        if (!endpoint.startsWith('https://api.openai.com/')) {
            return res.status(400).json({ error: 'Invalid API endpoint' });
        }

        // Make request to OpenAI API
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('OpenAI API proxy error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

