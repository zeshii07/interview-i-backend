
const interviewService = require('../services/interviewService');
const officeParser = require('officeparser');
const WordExtractor = require('word-extractor');

const ALLOWED_DIFFICULTIES = ['beginner', 'intermediate', 'expert'];
const ALLOWED_QUESTION_TYPES = ['mixed', 'technical', 'behavioral', 'situational'];

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function extractResumeText(file) {
  const extension = file.originalname.split('.').pop()?.toLowerCase();

  if (extension === 'doc') {
    const document = await new WordExtractor().extract(file.buffer);
    return document.getBody();
  }

  const ast = await officeParser.parseOffice(file.buffer, { fileType: extension });
  const result = await ast.to('text');
  return String(result.value || '');
}

exports.generateQuestion = async (req, res) => {
  try {
    const {
      role,
      difficulty = 'intermediate',
      questionType = 'mixed',
      language = 'English',
      previousQuestions = [],
    } = req.body || {};

    const cleanRole = cleanText(role);
    const cleanDifficulty = cleanText(difficulty).toLowerCase();
    const cleanQuestionType = cleanText(questionType).toLowerCase();

    if (cleanRole.length < 2 || cleanRole.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid role title between 2 and 100 characters.',
      });
    }

    if (!ALLOWED_DIFFICULTIES.includes(cleanDifficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid difficulty. Choose beginner, intermediate, or expert.',
      });
    }

    if (!ALLOWED_QUESTION_TYPES.includes(cleanQuestionType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question type. Choose mixed, technical, behavioral, or situational.',
      });
    }

    const safePreviousQuestions = Array.isArray(previousQuestions)
      ? previousQuestions
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(-8)
      : [];

    const question = await interviewService.generateQuestion(
      cleanRole,
      cleanDifficulty,
      cleanQuestionType,
      language,
      safePreviousQuestions
    );

    return res.json({ success: true, data: question, language: question.language });
  } catch (error) {
    console.error('Generate question controller error:', error);
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

    const cleanRole = cleanText(role);
    const cleanDifficulty = cleanText(difficulty).toLowerCase();
    const cleanQuestion = cleanText(question);
    const cleanAnswer = cleanText(userAnswer);

    if (!cleanRole || !cleanQuestion || !cleanAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Role, question, and userAnswer are required.',
      });
    }

    if (!ALLOWED_DIFFICULTIES.includes(cleanDifficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid difficulty. Choose beginner, intermediate, or expert.',
      });
    }

    if (cleanAnswer.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a more detailed answer of at least 20 characters.',
      });
    }

    if (cleanAnswer.length > 12000) {
      return res.status(400).json({
        success: false,
        message: 'The answer is too long. Please keep it under 12,000 characters.',
      });
    }

    const evaluation = await interviewService.evaluateAnswer(
      cleanRole,
      cleanDifficulty,
      cleanQuestion,
      cleanAnswer,
      language,
      questionCategory
    );

    return res.json({ success: true, data: evaluation });
  } catch (error) {
    console.error('Evaluate answer controller error:', error);
    return res.status(500).json({
      success: false,
      message: error.publicMessage || 'Failed to evaluate the interview answer.',
    });
  }
};

exports.analyzeResume = async (req, res) => {
  try {
    const { jobDescription, language = 'English' } = req.body || {};
    const resumeText = req.file
      ? await extractResumeText(req.file)
      : cleanText(req.body?.resumeText);

    const cleanedResumeText = cleanText(resumeText);
    const cleanedJobDescription = cleanText(jobDescription);

    if (cleanedResumeText.length < 50) {
      return res.status(400).json({
        success: false,
        message: 'We could not extract enough resume text. Try another PDF, DOCX, or DOC file.',
      });
    }

    if (cleanedResumeText.length > 50000) {
      return res.status(400).json({
        success: false,
        message: 'The resume is too long to analyze. Please upload a shorter resume.',
      });
    }

    if (cleanedJobDescription.length > 30000) {
      return res.status(400).json({
        success: false,
        message: 'The job description is too long. Please shorten it and try again.',
      });
    }

    const analysis = await interviewService.analyzeResume(
      cleanedResumeText,
      cleanedJobDescription,
      language
    );

    return res.json({
      success: true,
      data: analysis,
      source: req.file ? 'uploaded_file' : 'pasted_text',
    });
  } catch (error) {
    console.error('Analyze resume controller error:', error);
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

    const cleanRole = cleanText(role);
    const cleanDifficulty = cleanText(difficulty).toLowerCase();

    if (cleanRole.length < 2 || cleanRole.length > 100) {
      return res.status(400).json({ success: false, message: 'Please provide a valid role title.' });
    }

    if (cleanDifficulty !== 'mixed' && !ALLOWED_DIFFICULTIES.includes(cleanDifficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid difficulty. Choose mixed, beginner, intermediate, or expert.',
      });
    }

    const safeCount = clampInteger(count, 3, 20, 10);
    const questions = await interviewService.getQuestionBank(
      cleanRole,
      safeCount,
      cleanDifficulty,
      language
    );

    return res.json({ success: true, data: questions });
  } catch (error) {
    console.error('Question bank controller error:', error);
    return res.status(500).json({
      success: false,
      message: error.publicMessage || 'Failed to generate the question bank.',
    });
  }
};

exports.getRoles = async (req, res) => {
  return res.json({ success: true, data: interviewService.ROLES });
};
