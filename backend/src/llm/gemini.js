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
        throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
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
