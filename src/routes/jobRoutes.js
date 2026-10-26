/**
 * Job search routes.
 * Mounted under /api/jobs in src/index.js.
 */

const express = require('express');
const router = express.Router();

const jobController = require('../controllers/jobController');

router.get('/providers', jobController.getProviders);
router.get('/health', jobController.health);
router.post('/search', jobController.search);

module.exports = router;
