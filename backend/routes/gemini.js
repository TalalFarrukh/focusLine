const express = require("express");
const { generateText, testConnection, analyzeContent, analyzeContentBatch, analyzeUrlQuick, analyzeUrlGrounded } = require("../services/geminiService");
const { rateLimit } = require("../middleware/rateLimit");
const { setCache, getCache } = require("../services/cacheService");

const router = express.Router();
// Simple in-memory cooldown to respect provider 429s across requests
let providerCooldownUntil = 0; // epoch ms

// Single-flight deduplication for analyze-url requests
const urlAnalysisPromises = new Map();

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

// Batch content analysis
router.post("/analyze-batch", rateLimit({ key: "gemini:analyze-batch", limit: 30 }), async (req, res, next) => {
  try {
    // Respect provider cooldown window
    const nowTs = Date.now();
    if (nowTs < providerCooldownUntil) {
      const retrySeconds = Math.ceil((providerCooldownUntil - nowTs) / 1000);
      res.set("Retry-After", String(retrySeconds));
      return res.status(429).json({ success: false, error: "Provider rate limit active. Please retry later.", retryAfter: retrySeconds });
    }
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "'items' must be a non-empty array" });
    }

    // Normalize and validate items
    const normalized = items
      .filter(it => it && typeof it.text === 'string' && it.text.trim().length > 0)
      .map(it => ({ id: String(it.id || ''), text: it.text.trim().slice(0, 10000) }));

    if (normalized.length === 0) {
      return res.status(400).json({ success: false, error: "No valid items to analyze" });
    }

    // Attempt cache for each item by content hash (simple hash: length+first/last 50 chars)
    const cachedResults = {};
    const toAnalyze = [];

    for (const it of normalized) {
      const keyBase = `${it.text.length}:${it.text.slice(0,50)}:${it.text.slice(-50)}`;
      const cacheKey = `gemini:analyze:${Buffer.from(keyBase).toString('base64')}`;
      // eslint-disable-next-line no-await-in-loop
      const cached = await getCache(cacheKey);
      if (cached) {
        cachedResults[it.id || keyBase] = cached;
      } else {
        toAnalyze.push({ ...it, cacheKey });
      }
    }

    let batchResults = {};

    if (toAnalyze.length > 0) {
      try {
        // Single provider call for remaining items
        const providerResults = await analyzeContentBatch(toAnalyze.map(x => ({ id: x.id || x.cacheKey, text: x.text })));
        batchResults = providerResults || {};

        // Cache results
        for (const it of toAnalyze) {
          const id = it.id || it.cacheKey;
          const analysis = batchResults[id];
          if (analysis) {
            // eslint-disable-next-line no-await-in-loop
            await setCache(it.cacheKey, analysis, 24 * 60 * 60);
          }
        }
      } catch (e) {
        const msg = String(e.message || "").toLowerCase();
        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate limit")) {
          const retrySeconds = 60; // default cooldown
          providerCooldownUntil = Date.now() + retrySeconds * 1000;
          res.set("Retry-After", String(retrySeconds));
          return res.status(429).json({ success: false, error: "Provider quota exceeded", retryAfter: retrySeconds });
        }
        // Other errors -> propagate
        throw e;
      }
    }

    const results = { ...cachedResults, ...batchResults };

    return res.json({
      success: true,
      message: "Batch content analysis completed",
      data: { 
        results, 
        analyzedCount: Object.keys(batchResults).length,
        cachedCount: Object.keys(cachedResults).length
      }
    });
  } catch (error) {
    next(error);
  }
});

// URL analysis for tab blocking and link checks
router.post("/analyze-url", rateLimit({ key: "gemini:analyze-url", limit: 60 }), async (req, res, next) => {
  try {
    const { url, anchorText = "", pageCategory = "general", grounded = true } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: "'url' is required" });
    }

    // Normalize URL for deduplication
    const normUrl = String(url).trim();
    const cacheKey = `gemini:analyze-url:${normUrl}:${pageCategory}`;
    const dedupeKey = `${normUrl}:${pageCategory}:${grounded}`;

    // Check cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, message: "URL analysis (cache)", data: { url: normUrl, analysis: cached, timestamp: new Date().toISOString() } });
    }

    // Check if there's already a pending request for this URL
    if (urlAnalysisPromises.has(dedupeKey)) {
      console.log(`FocusLine: Deduplicating analyze-url request for: ${normUrl}`);
      try {
        const result = await urlAnalysisPromises.get(dedupeKey);
        return res.json({ success: true, message: "URL analysis (deduplicated)", data: { url: normUrl, analysis: result, timestamp: new Date().toISOString() } });
      } catch (error) {
        // If the pending request failed, remove it and continue with new request
        urlAnalysisPromises.delete(dedupeKey);
      }
    }

    // Create new analysis promise
    const analysisPromise = (async () => {
      try {
        const analysis = grounded
          ? await analyzeUrlGrounded({ url: normUrl, anchorText, pageCategory })
          : await analyzeUrlQuick({ url: normUrl, anchorText, pageCategory });

        // Cache for 24h
        await setCache(cacheKey, analysis, 24 * 60 * 60);
        
        return analysis;
      } finally {
        // Clean up promise after completion (success or failure)
        setTimeout(() => urlAnalysisPromises.delete(dedupeKey), 5000); // Keep for 5s to handle edge cases
      }
    })();

    // Store the promise for deduplication
    urlAnalysisPromises.set(dedupeKey, analysisPromise);

    // Wait for analysis
    const analysis = await analysisPromise;

    return res.json({ success: true, message: "URL analysis completed", data: { url: normUrl, analysis, timestamp: new Date().toISOString() } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
