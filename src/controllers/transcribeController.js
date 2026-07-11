const { transcribeAudio } = require('../services/transcribeService');

exports.transcribeAudioFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    // req.file is the audio file sent from the phone
    const text = await transcribeAudio(req.file.buffer, req.file.originalname);

    res.json({
      success: true,
      data: text
    });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ success: false, message: error.message || 'Transcription failed' });
  }
};