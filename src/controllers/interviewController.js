const interviewService = require('../services/interviewService');

// Generate a single interview question
exports.generateQuestion = async (req, res) => {
  try {
    const { role, difficulty, questionType } = req.body;

    // Validate inputs
    if (!role || !interviewService.ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Choose from: ${interviewService.ROLES.join(', ')}`
      });
    }

    if (!difficulty || !interviewService.DIFFICULTY_LEVELS.includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: `Invalid difficulty. Choose from: ${interviewService.DIFFICULTY_LEVELS.join(', ')}`
      });
    }

    const question = await interviewService.generateQuestion(role, difficulty, questionType);

    res.json({
      success: true,
      data: question
    });

  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Evaluate user's answer
exports.evaluateAnswer = async (req, res) => {
  try {
    const { role, difficulty, question, userAnswer } = req.body;

    // Validate required fields
    if (!role || !question || !userAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Role, question, and userAnswer are required'
      });
    }

    if (userAnswer.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a more detailed answer (at least 20 characters)'
      });
    }

    const evaluation = await interviewService.evaluateAnswer(
      role, 
      difficulty || 'intermediate', 
      question, 
      userAnswer
    );

    res.json({
      success: true,
      data: evaluation
    });

  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Analyze resume
exports.analyzeResume = async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || resumeText.length < 50) {
      return res.status(400).json({
        success: false,
        message: 'Please provide resume text (at least 50 characters)'
      });
    }

    const analysis = await interviewService.analyzeResume(resumeText, jobDescription);

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get question bank
exports.getQuestionBank = async (req, res) => {
  try {
    const { role, count } = req.body;

    if (!role || !interviewService.ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Choose from: ${interviewService.ROLES.join(', ')}`
      });
    }

    const questions = await interviewService.getQuestionBank(role, count || 10);

    res.json({
      success: true,
      data: questions
    });

  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get available roles
exports.getRoles = async (req, res) => {
  res.json({
    success: true,
    data: interviewService.ROLES
  });
};