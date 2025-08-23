const express = require('express');
const healthRouter = require('./health');
const geminiRouter = require('./gemini');
const settingsRouter = require('./settings');

const router = express.Router();

// API routes
router.use('/health', healthRouter);
router.use('/gemini', geminiRouter);
router.use('/settings', settingsRouter);

module.exports = router;
