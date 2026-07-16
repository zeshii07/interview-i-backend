const express = require('express');
const router = express.Router();
const interviewController = require('../controllers/interviewController');
const multer = require('multer');
const resumePdfController = require('../controllers/resumePdfController');

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = /\.(pdf|docx|doc)$/i.test(file.originalname);
    callback(allowed ? null : new Error('Only PDF, DOCX, and DOC resumes are supported.'), allowed);
  },
});

// GET routes
router.get('/roles', interviewController.getRoles);

// POST routes
router.post('/generate-question', interviewController.generateQuestion);
router.post('/evaluate-answer', interviewController.evaluateAnswer);
router.post('/analyze-resume', resumeUpload.single('resume'), interviewController.analyzeResume);
router.post('/question-bank', interviewController.getQuestionBank);

// Add this line before module.exports:
router.post('/generate-resume-pdf', resumePdfController.generateResumePdf);

module.exports = router;
