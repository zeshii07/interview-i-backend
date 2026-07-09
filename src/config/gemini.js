const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// We are using Llama 3 (Free, incredibly fast)
const model = 'llama-3.1-8b-instant';

module.exports = { groq, model };