const interviewService = require('../services/interviewService');

// Generate a single interview question
exports.generateQuestion = async (req, res) => {
  try {
    const { role, difficulty, questionType } = req.body;

    // Validate inputs - Removed strict role check, just ensure it's not empty
    if (!role || role.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role title (e.g., "Frontend Developer")'
      });
    }

    if (!difficulty || !['beginner', 'intermediate', 'expert'].includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid difficulty. Choose from: beginner, intermediate, expert'
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

    // Removed strict role check here too
    if (!role || role.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role title'
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

// Get available roles (You can keep this for the Question Bank screen dropdown if needed, 
// but it's no longer enforced by the backend)
exports.getRoles = async (req, res) => {
  res.json({
    success: true,
    data: interviewService.ROLES
  });
};