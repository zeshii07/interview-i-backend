const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Your Groq API Key is already in process.env.GROQ_API_KEY
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function transcribeAudio(fileBuffer, originalName) {
  const formData = new FormData();
  
  // Append the audio file. Whisper supports wav, m4a, mp3, etc.
  formData.append('file', fileBuffer, {
    filename: originalName || 'audio.m4a',
    contentType: 'audio/mpeg', 
  });
  
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'json');

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        ...formData.getHeaders(), // Sets 'multipart/form-data' boundary
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Transcription failed');
    }

    const data = await response.json();
    return data.text; // Returns perfectly formatted text with punctuation!
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error('Failed to transcribe audio');
  }
}

module.exports = { transcribeAudio };