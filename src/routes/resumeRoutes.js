const express = require('express');

const resumePdfController = require('../controllers/resumePdfController');
const resumeDocxController = require('../controllers/resumeDocxController');
const resumeController = require('../controllers/resumeController');

const router = express.Router();

// AI optimization endpoint
router.post('/generate', resumeController.generateOptimizedResume);

// PDF download endpoint
router.post('/pdf', resumePdfController.generateResumePdf);

// DOCX download endpoint
router.post('/docx', resumeDocxController.generateResumeDocx);

module.exports = router;