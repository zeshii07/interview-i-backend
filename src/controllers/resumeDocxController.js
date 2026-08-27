const { generateResumeDocx } = require('../services/resumeDocxService');

exports.generateResumeDocx = async (req, res) => {
  try {
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid resume data is required.',
      });
    }

    const hasRequiredIdentity =
      typeof req.body.firstName === 'string' &&
      req.body.firstName.trim().length > 0 &&
      typeof req.body.lastName === 'string' &&
      req.body.lastName.trim().length > 0;

    if (!hasRequiredIdentity) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required.',
      });
    }

    const { buffer, filename } = await generateResumeDocx(req.body);

    res.status(200);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.send(buffer);
  } catch (error) {
    console.error('DOCX generation error:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate the DOCX file.',
      });
    }

    return res.end();
  }
};
