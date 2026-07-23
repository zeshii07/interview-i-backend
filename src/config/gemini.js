const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// This model is hosted and called through Groq. Render/local environments can
// override the free-tier-friendly default without changing source code.
const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

module.exports = { groq, model };
