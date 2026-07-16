const express = require('express');

const resumePdfController = require('../controllers/resumePdfController');
const resumeController = require('../controllers/resumeController');

const router = express.Router();

// AI optimization endpoint
router.post('/generate', resumeController.generateOptimizedResume);

// PDF download endpoint
router.post('/pdf', resumePdfController.generateResumePdf);

module.exports = router;