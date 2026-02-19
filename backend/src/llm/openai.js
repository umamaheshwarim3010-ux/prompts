/**
 * OpenAI LLM Adapter (Stub)
 * 
 * Not wired. Exists for future provider swap via LLM_PROVIDER env var.
 * Implements the same contract as infinitai.js:
 *   generate({ template, sourceCode }) -> string
 */

async function generate({ template, sourceCode }) {
    throw new Error(
        'OpenAI provider is not implemented. Set LLM_PROVIDER=infinitai or implement this adapter.'
    );
}

module.exports = { generate };
