const express = require('express');
const router = express.Router();

const readinessController = require('../controllers/readinessController');

router.post('/readiness', readinessController.getReadiness);

module.exports = router;
