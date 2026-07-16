const { generateResumePdf } = require('../services/resumePdfService');

exports.generateResumePdf = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ success: false, message: 'No data provided' });
    }

    const pdfStream = await generateResumePdf(req.body);
    
    // pdfStream is actually the Express response object, pass it directly
    pdfStream.pipe(res);

  } catch (error) {
    console.error('PDF Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
};