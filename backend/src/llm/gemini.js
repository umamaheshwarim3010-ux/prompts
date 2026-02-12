/**
 * Gemini LLM Adapter
 * 
 * Accepts { template, sourceCode } and returns raw generated text.
 * No formatting, parsing, or file system logic.
 * Deterministic generation params are locked.
 */

async function generate({ template, sourceCode }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Locked deterministic generation parameters
    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: template },
                    { text: `\n\nSource Code:\n\`\`\`\n${sourceCode}\n\`\`\`` }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.0,
            topP: 0.1,
            maxOutputTokens: 8192
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        let userMessage = `Gemini API error (${response.status})`;

        try {
            const parsed = JSON.parse(errorBody);
            const apiMessage = parsed?.error?.message || '';
            const status = parsed?.error?.status || '';

            if (response.status === 429) {
                // Rate limit / quota exceeded
                const retryInfo = parsed?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
                const retryDelay = retryInfo?.retryDelay || '';
                userMessage = `API rate limit exceeded. ${retryDelay ? `Please retry after ${retryDelay}.` : 'Please wait a moment and try again.'} You may need to check your Gemini API quota at https://ai.google.dev/gemini-api/docs/rate-limits`;
            } else if (response.status === 401 || response.status === 403) {
                userMessage = 'Gemini API key is invalid or unauthorized. Please check your GEMINI_API_KEY in the .env file.';
            } else if (apiMessage) {
                // Extract just the first sentence of the API message
                const firstSentence = apiMessage.split('.')[0];
                userMessage = `Gemini API error: ${firstSentence}.`;
            }
        } catch (parseErr) {
            // If body isn't JSON, use a generic message
            userMessage = `Gemini API returned an error (HTTP ${response.status}). Please try again later.`;
        }

        console.error(`Gemini API raw error: ${errorBody.substring(0, 500)}`);
        throw new Error(userMessage);
    }

    const data = await response.json();

    // Extract text from response
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
        throw new Error('Gemini returned no candidates');
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
        throw new Error('Gemini returned no content parts');
    }

    return parts.map(p => p.text).join('');
}

module.exports = { generate };
