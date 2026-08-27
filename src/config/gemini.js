const Groq = require('groq-sdk');

// groq-sdk 1.6.0+ throws at construction time if GROQ_API_KEY is missing.
// Use lazy initialization so the server can start (and serve /api/health)
// even before the key is configured. The client is created on first access.
let _groq = null;
let _model = null;

function getModel() {
  if (_model === null) {
    // Default: openai/gpt-oss-20b — OpenAI's open-weight 20B model hosted on Groq.
    // Fast, capable, and supports JSON mode for structured output.
    // Override via GROQ_MODEL env var if needed.
    _model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  }
  return _model;
}

function getGroq() {
  if (_groq === null) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY environment variable is missing or empty. ' +
        'Set it in your .env file or Render environment variables.'
      );
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

// Backward-compatible exports: existing code does `const { groq, model } = require('./gemini')`
// and then `groq.chat.completions.create(...)`. We export a getter proxy that
// lazily creates the client on first property access.
const groq = new Proxy({}, {
  get(_target, prop) {
    const client = getGroq();
    return client[prop];
  },
});

module.exports = {
  groq,
  // `model` is a string, safe to evaluate eagerly
  get model() {
    return getModel();
  },
};
