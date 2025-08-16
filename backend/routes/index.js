const express = require("express");
const healthRouter = require("./health");
const geminiRouter = require("./gemini");

const router = express.Router();

router.use("/health", healthRouter);
router.use("/gemini", geminiRouter);

module.exports = router;
