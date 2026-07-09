const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');

// GET routes
router.get('/roles', interviewController.getRoles);

// POST routes
router.post('/generate-question', interviewController.generateQuestion);
router.post('/evaluate-answer', interviewController.evaluateAnswer);
router.post('/analyze-resume', interviewController.analyzeResume);
router.post('/question-bank', interviewController.getQuestionBank);

module.exports = router;