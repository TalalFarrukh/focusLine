const express = require("express");
const { generateText, testConnection, analyzeContent } = require("../services/geminiService");

const router = express.Router();

router.get("/test-connection", async (req, res, next) => {
  try {
    const result = await testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: "Gemini API connection test completed",
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Gemini API connection test failed",
        error: result.error
      });
    }
  } catch (error) {
    next(error);
  }
});

router.post("/test", async (req, res, next) => {
  try {
    const { prompt } = req.body;
    
    // Input validation
    if (!prompt) {
      return res.status(400).json({ 
        success: false,
        error: "Prompt is required" 
      });
    }

    if (typeof prompt !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: "Prompt must be a string" 
      });
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "Prompt cannot be empty" 
      });
    }

    const response = await generateText(prompt);
    
    res.json({ 
      success: true, 
      message: "Text generation successful",
      data: {
        prompt: prompt,
        response: response,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/analyze", async (req, res, next) => {
  try {
    const { text } = req.body;
    
    // Input validation
    if (!text) {
      return res.status(400).json({ 
        success: false,
        error: "Text content is required" 
      });
    }

    if (typeof text !== 'string') {
      return res.status(400).json({ 
        success: false,
        error: "Text must be a string" 
      });
    }

    if (text.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: "Text cannot be empty" 
      });
    }

    const analysis = await analyzeContent(text);
    
    res.json({ 
      success: true, 
      message: "Content analysis completed",
      data: {
        originalText: text,
        analysis: analysis,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
