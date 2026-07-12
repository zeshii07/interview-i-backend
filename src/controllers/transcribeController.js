const {
  transcribeAudio,
} = require('../services/transcribeService');

exports.transcribeAudioFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided',
      });
    }

    console.log('Audio file received:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: Buffer.isBuffer(req.file.buffer),
    });

    if (!Buffer.isBuffer(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: 'Audio buffer was not received',
      });
    }

    if (req.file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Uploaded audio file is empty',
      });
    }

    const text = await transcribeAudio(
      req.file.buffer,
      req.file.originalname
    );

    return res.status(200).json({
      success: true,
      data: text,
    });
  } catch (error) {
    console.error('Transcription controller error:', {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message:
        error.message || 'Failed to transcribe audio',
    });
  }
};