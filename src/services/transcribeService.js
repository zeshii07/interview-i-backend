const axios = require('axios');
const FormData = require('form-data');

const GROQ_API_URL =
  'https://api.groq.com/openai/v1/audio/transcriptions';

const TRANSCRIPTION_LANGUAGE_CODES = {
  english: 'en', urdu: 'ur', hindi: 'hi', arabic: 'ar',
  spanish: 'es', french: 'fr', german: 'de',
};

function getLanguageCode(language) {
  return TRANSCRIPTION_LANGUAGE_CODES[String(language || '').trim().toLowerCase()];
}

function getMimeType(filename = '') {
  const extension = filename
    .split('.')
    .pop()
    ?.toLowerCase();

  const types = {
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
  };

  return types[extension] || 'application/octet-stream';
}

async function transcribeAudio(
  fileBuffer,
  originalName = 'audio.m4a',
  language
) {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid audio buffer');
  }

  if (fileBuffer.length === 0) {
    throw new Error('Audio file is empty');
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is missing');
  }

  const mimeType = getMimeType(originalName);

  const formData = new FormData();

  formData.append('file', fileBuffer, {
    filename: originalName,
    contentType: mimeType,
    knownLength: fileBuffer.length,
  });

  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'json');

  const languageCode = getLanguageCode(language);
  if (languageCode) formData.append('language', languageCode);

  try {
    const response = await axios.post(
      GROQ_API_URL,
      formData,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000,
      }
    );

    if (!response.data?.text) {
      throw new Error('Groq returned an empty transcript');
    }

    return response.data.text;
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      'Failed to transcribe audio';

    console.error('Groq transcription error:', {
      status: error.response?.status,
      message,
      fileName: originalName,
      mimeType,
      fileSize: fileBuffer.length,
    });

    throw new Error(message);
  }
}

module.exports = {
  transcribeAudio,
};
