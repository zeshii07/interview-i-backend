const interviewService = require('../services/interviewService');
const officeParser = require('officeparser');
const WordExtractor = require('word-extractor');

const DIFFICULTIES = ['beginner', 'intermediate', 'expert'];
const QUESTION_TYPES = ['mixed', 'technical', 'behavioral', 'situational'];

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const clampInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const extractResumeText = async (file) => {
  const extension = file.originalname.split('.').pop()?.toLowerCase();

  if (extension === 'doc') {
    const document = await new WordExtractor().extract(file.buffer);
    return document.getBody();
  }

  const ast = await officeParser.parseOffice(file.buffer, { fileType: extension });
  const result = await ast.to('text');
  return String(result.value || '');
};

exports.generateQuestion = async (req, res) => {
  try {
    const {
      role,
      difficulty = 'intermediate',
      questionType = 'mixed',
      language = 'English',
      previousQuestions = [],
    } = req.body || {};

    const safeRole = clean(role);
    const safeDifficulty = clean(difficulty).toLowerCase();
    const safeType = clean(questionType).toLowerCase();

    if (safeRole.length < 2 || safeRole.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role title between 2 and 100 characters.',
      });
    }

    if (!DIFFICULTIES.includes(safeDifficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid difficulty. Choose beginner, intermediate, or expert.',
      });
    }

    if (!QUESTION_TYPES.includes(safeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question type.',
      });
    }

    const recentQuestions = Array.isArray(previousQuestions)
      ? previousQuestions.filter((q) => typeof q === 'string').map((q) => q.trim()).filter(Boolean).slice(-8)
      : [];

    const question = await interviewService.generateQuestion(
      safeRole,
      safeDifficulty,
      safeType,
      language,
      recentQuestions
    );

    return res.json({ success: true, data: question, language: question.language });
  } catch (error) {
    console.error('Generate question error:', error);
    return res.status(500).json({
      success: false,
      message: error.publicMessage || 'Failed to generate an interview question.',
    });
  }
};

exports.evaluateAnswer = async (req, res) => {
  try {
    const {
      role,
      difficulty = 'intermediate',
      question,
      questionCategory,
      userAnswer,
      language = 'English',
    } = req.body || {};

    const safeRole = clean(role);
    const safeQuestion = clean(question);
    const safeAnswer = clean(userAnswer);
    const safeDifficulty = clean(difficulty).toLowerCase();

    if (!safeRole || !safeQuestion || !safeAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Role, question, and userAnswer are required.',
      });
    }

    if (!DIFFICULTIES.includes(safeDifficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty.' });
    }

    if (safeAnswer.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a more detailed answer of at least 20 characters.',
      });
    }

    if (safeAnswer.length > 12000) {
      return res.status(400).json({ success: false, message: 'Answer is too long.' });
    }

    const evaluation = await interviewService.evaluateAnswer(
      safeRole,
      safeDifficulty,
      safeQuestion,
      safeAnswer,
      language,
      questionCategory
    );

    return res.json({ success: true, data: evaluation });
  } catch (error) {
    console.error('Evaluate answer error:', error);
    return res.status(500).json({
      success: false,
      message: error.publicMessage || 'Failed to evaluate the answer.',
    });
  }
};

exports.analyzeResume = async (req, res) => {
  try {
    const resumeText = req.file
      ? await extractResumeText(req.file)
      : clean(req.body?.resumeText);
    const jobDescription = clean(req.body?.jobDescription);
    const safeResumeText = clean(resumeText);

    if (safeResumeText.length < 50) {
      return res.status(400).json({
        success: false,
        message: 'We could not extract enough resume text. Try another PDF, DOCX, or DOC file.',
      });
    }

    if (safeResumeText.length > 50000 || jobDescription.length > 30000) {
      return res.status(400).json({
        success: false,
        message: 'The supplied resume or job description is too long.',
      });
    }

    const analysis = await interviewService.analyzeResume(safeResumeText, jobDescription);

    return res.json({
      success: true,
      data: analysis,
      source: req.file ? 'uploaded_file' : 'pasted_text',
    });
  } catch (error) {
    console.error('Analyze resume error:', error);
    return res.status(500).json({
      success: false,
      message: error.publicMessage || 'Failed to analyze the resume.',
    });
  }
};

exports.getQuestionBank = async (req, res) => {
  try {
    const {
      role,
      count = 10,
      difficulty = 'mixed',
      language = 'English',
    } = req.body || {};

    const safeRole = clean(role);
    const safeDifficulty = clean(difficulty).toLowerCase();

    if (safeRole.length < 2 || safeRole.length > 100) {
      return res.status(400).json({ success: false, message: 'Please provide a valid role title.' });
    }

    if (safeDifficulty !== 'mixed' && !DIFFICULTIES.includes(safeDifficulty)) {
      return res.status(400).json({ success: false, message: 'Invalid difficulty.' });
    }

    const questions = await interviewService.getQuestionBank(
      safeRole,
      clampInt(count, 3, 20, 10),
      safeDifficulty,
      language
    );

    return res.json({ success: true, data: questions });
  } catch (error) {
    console.error('Question bank error:', error);
    return res.status(500).json({
      success: false,
      message: error.publicMessage || 'Failed to generate the question bank.',
    });
  }
};

exports.getRoles = async (req, res) => {
  return res.json({ success: true, data: interviewService.ROLES });
};
