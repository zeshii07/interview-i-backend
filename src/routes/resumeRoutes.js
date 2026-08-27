const express = require('express');

const resumeController = require('../controllers/resumeController');

const router = express.Router();

// AI resume optimization endpoint (Groq)
// PDF and DOCX generation are handled 100% on the frontend — no backend
// endpoints needed for file download. The backend only does AI.
router.post('/generate', resumeController.generateOptimizedResume);

module.exports = router;