const {
  generateOptimizedResume,
} = require('../services/resumeService');

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

exports.generateOptimizedResume = async (req, res) => {
  try {
    const resumeData = req.body;

    if (
      !resumeData ||
      typeof resumeData !== 'object' ||
      Array.isArray(resumeData)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid resume data is required.',
      });
    }

    const firstName = cleanText(resumeData.firstName);
    const lastName = cleanText(resumeData.lastName);
    const email = cleanText(resumeData.email);
    const targetRole = cleanText(resumeData.targetRole);

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required.',
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required.',
      });
    }

    if (!targetRole) {
      return res.status(400).json({
        success: false,
        message: 'Target role is required.',
      });
    }

    const result = await generateOptimizedResume(resumeData);

    return res.status(200).json({
      success: true,
      resume: result.resume,
      suggestions: result.suggestions,
    });
  } catch (error) {
    console.error('Resume optimization error:', error);

    const statusCode =
      error.code === 'INVALID_AI_RESPONSE'
        ? 502
        : error.code === 'GROQ_TOKEN_LIMIT'
          ? 413
          : error.status === 429
            ? 429
            : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        error.publicMessage ||
        'Failed to optimize the resume. Please try again.',
    });
  }
};
