const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load API key from environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("❌ Missing GEMINI_API_KEY in environment variables");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Helper: create a model configured to return JSON
function getJsonModel(responseSchema = undefined) {
  const base = {
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
    },
  };
  if (responseSchema) {
    base.generationConfig.responseSchema = responseSchema;
  }
  return genAI.getGenerativeModel(base);
}

// Helper: call Gemini with Google Search grounding (flash model; not supported on flash-lite)
async function generateGroundedJson(prompt) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    tools: [{ googleSearch: {} }]
  });
  const result = await model.generateContent(prompt);
  const text = typeof result?.response?.text === 'function' ? result.response.text() : String(result?.response?.text || '');
  return text;
}

// Helper: robust JSON extraction from LLM output
function extractFirstJsonSegment(text) {
  if (!text) return null;
  let start = -1;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (inString) {
      if (ch === stringChar && prev !== '\\') {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    if (ch === '"' || ch === '\'') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

async function generateJson(prompt, responseSchema = undefined) {
  const model = getJsonModel(responseSchema);
  const result = await model.generateContent(prompt);
  const response = result.response.text();
  return response;
}

/**
 * Test the Gemini API connection with a simple prompt
 * @returns {Promise<object>} - Test result with status and response
 */
const testConnection = async () => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent("Hello, this is a test. Please respond with 'Connection successful' if you can read this.");
    const response = result.response.text();

    return {
      success: true,
      message: "Gemini API connection successful",
      response: response,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Gemini API Test Error:", error.message);
    return {
      success: false,
      message: "Gemini API connection failed",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Send a prompt to Gemini and get a response.
 * @param {string} prompt - The user input prompt
 * @returns {Promise<string>} - The Gemini response text
 */
const generateText = async (prompt) => {
  try {
    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      throw new Error("Invalid prompt: must be a non-empty string");
    }

    if (prompt.length > 10000) {
      throw new Error("Prompt too long: maximum 10,000 characters allowed");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);

    // Validate response
    const response = result.response.text();
    if (!response || response.trim().length === 0) {
      throw new Error("Empty response received from Gemini API");
    }

    return response;
  } catch (error) {
    console.error("Gemini API Error:", error.message);

    // Handle specific error types
    if (error.message.includes("API key")) {
      throw new Error("Invalid or missing API key");
    } else if (error.message.includes("quota") || error.message.includes("429")) {
      throw new Error("API quota exceeded");
    } else if (error.message.includes("rate limit")) {
      throw new Error("Rate limit exceeded");
    } else {
      throw new Error(`Failed to fetch response from Gemini API: ${error.message}`);
    }
  }
};

/**
 * Analyze text content for appropriateness
 * @param {string} text - The text to analyze
 * @returns {Promise<object>} - Analysis result with score and recommendations
 */
const analyzeContent = async (text) => {
  try {
    const prompt = `
      Analyze this content for appropriateness and provide a structured response.

      Content: "${text}"

      You must respond with ONLY a valid JSON object, nothing else.

      STRICT RULES:
      - Do NOT include Markdown formatting.
      - Do NOT include code fences (no triple backticks).
      - Do NOT include the word "json".
      - Do NOT include any text before or after the JSON object.
      - The response MUST be a single valid JSON object.

      Format to follow exactly:
      {
        "score": number (1-10, where 1=safe, 10=highly inappropriate),
        "shouldBlock": boolean,
        "confidence": number (0-1),
        "reasoning": string,
        "analysis": {
          "explicitContent": boolean,
          "inappropriateLanguage": boolean,
          "context": string
        }
      }
    `;

    const response = await generateText(prompt);

    // Try to parse JSON response
    try {
      const analysis = JSON.parse(response);

      // Validate analysis structure
      if (typeof analysis.score !== 'number' || analysis.score < 1 || analysis.score > 10) {
        throw new Error("Invalid score in response");
      }

      if (typeof analysis.shouldBlock !== 'boolean') {
        throw new Error("Invalid shouldBlock value in response");
      }

      return analysis;
    } catch (parseError) {
      // If JSON parsing fails, create a fallback analysis
      console.warn("Failed to parse JSON response, creating fallback analysis");
      return {
        score: 5,
        shouldBlock: false,
        confidence: 0.5,
        reasoning: "Unable to parse AI response",
        analysis: {
          explicitContent: false,
          inappropriateLanguage: false,
          context: "unknown"
        }
      };
    }
  } catch (error) {
    console.error("Content analysis error:", error.message);
    throw new Error(`Content analysis failed: ${error.message}`);
  }
};

/**
 * Analyze multiple items in a single provider call
 * @param {Array<{id: string, text: string}>} items
 * @returns {Promise<Object<string, object>>} - Map of id -> analysis
 */
const analyzeContentBatch = async (items) => {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No items provided for batch analysis");
    }

    // Build a compact prompt for multiple items
    const itemsBlock = items.map(it => `{"id":"${it.id}","content":"${(it.text || '').replace(/"/g, '\\"').substring(0, 1000)}"}`).join(',');

    const prompt = `
      You are analyzing multiple short content items. For EACH item, return an entry in a single JSON object keyed by the item's id.

      STRICT OUTPUT REQUIREMENTS:
      - Output ONLY a single valid JSON object with keys equal to the provided ids.
      - No markdown, no code fences, no extra text.
      - Do NOT include the word json or any commentary.
      - Each value MUST follow this exact schema:
        {
          "score": number (1-10),
          "shouldBlock": boolean,
          "confidence": number (0-1),
          "reasoning": string,
          "analysis": {
            "explicitContent": boolean,
            "inappropriateLanguage": boolean,
            "context": string
          }
        }

      ITEMS: [${itemsBlock}]

      Return format example (shape only):
      {
        "id1": { ... },
        "id2": { ... }
      }
    `;

    // Request strict JSON from the model
    let response;
    try {
      response = await generateJson(prompt);
    } catch (e) {
      throw e;
    }

    // Parse and validate the object map with fallbacks
    let parsed;
    try {
      parsed = JSON.parse(response);
    } catch (e) {
      // Try to extract a JSON segment and parse that
      const segment = extractFirstJsonSegment(response);
      if (segment) {
        try {
          parsed = JSON.parse(segment);
        } catch {
          // Retry once with a very strict reminder
          const strictPrompt = `${prompt}\n\nIMPORTANT: Output only the JSON object. No backticks, no prose.`;
          const retryResp = await generateJson(strictPrompt);
          try {
            parsed = JSON.parse(retryResp);
          } catch {
            const retrySeg = extractFirstJsonSegment(retryResp);
            if (retrySeg) {
              try {
                parsed = JSON.parse(retrySeg);
              } catch {
                throw new Error("Failed to parse batch JSON response");
              }
            } else {
              throw new Error("Failed to parse batch JSON response");
            }
          }
        }
      } else {
        throw new Error("Failed to parse batch JSON response");
      }
    }

    const results = {};

    for (const it of items) {
      const entry = parsed[it.id];
      if (entry && typeof entry === 'object') {
        // Minimal validation, fallback if invalid
        const isValid = typeof entry.score === 'number' && typeof entry.shouldBlock === 'boolean';
        results[it.id] = isValid ? entry : {
          score: 5,
          shouldBlock: false,
          confidence: 0.5,
          reasoning: "Invalid AI response entry",
          analysis: { explicitContent: false, inappropriateLanguage: false, context: "unknown" }
        };
      } else {
        results[it.id] = {
          score: 5,
          shouldBlock: false,
          confidence: 0.5,
          reasoning: "Missing AI response entry",
          analysis: { explicitContent: false, inappropriateLanguage: false, context: "unknown" }
        };
      }
    }

    return results;
  } catch (error) {
    console.error("Batch content analysis error:", error.message);
    throw new Error(`Content analysis failed: ${error.message}`);
  }
};

/**
 * Analyze a URL for appropriateness quickly using AI and lightweight context.
 * Input: { url, anchorText?, pageCategory? }
 * Output: { score, shouldBlock, confidence, reasoning }
 */
const analyzeUrlQuick = async ({ url, anchorText = "", pageCategory = "general" }) => {
  if (!url || typeof url !== 'string') throw new Error('Invalid URL');

  const escapedUrl = url.replace(/"/g, '\\"');
  const escapedAnchor = (anchorText || '').replace(/"/g, '\\"').substring(0, 300);
  const prompt = `
    You are a content safety filter. Decide if navigating to the URL should be blocked.

    STRICT OUTPUT: Return ONLY one JSON object, nothing else.
    {
      "score": number (1-10),
      "shouldBlock": boolean,
      "confidence": number (0-1),
      "reasoning": string
    }

    Inputs:
    URL: "${escapedUrl}"
    AnchorText: "${escapedAnchor}"
    PageCategory: "${pageCategory}"

    Guidance:
    - If URL obviously matches adult domains/paths, shouldBlock=true.
    - If clearly safe (news, docs, reputable sites), shouldBlock=false.
    - If ambiguous, weigh toward safety but reflect uncertainty in confidence.
  `;

  const resp = await generateJson(prompt);
  try {
    return JSON.parse(resp);
  } catch {
    const seg = extractFirstJsonSegment(resp);
    if (seg) {
      try { return JSON.parse(seg); } catch {}
    }
    return { score: 5, shouldBlock: false, confidence: 0.5, reasoning: 'Unparseable AI response' };
  }
};

/**
 * Analyze a URL using Google Search grounding for higher accuracy.
 * Uses Gemini with Search tools enabled to retrieve evidence and decide.
 * Returns a strict JSON decision object.
 */
const analyzeUrlGrounded = async ({ url, anchorText = "", pageCategory = "general" }) => {
  if (!url || typeof url !== 'string') throw new Error('Invalid URL');

  // Keep prompt compact; model is instructed to use search tools
  const escapedUrl = url.replace(/"/g, '\\"');
  const escapedAnchor = (anchorText || '').replace(/"/g, '\\"').substring(0, 300);

  const prompt = `
    Task: Decide if navigating to the URL is appropriate. Use Google Search grounding to verify destination reputation/content.

    STRICT OUTPUT: Return ONLY one JSON object, nothing else.
    {
      "score": number (1-10),
      "shouldBlock": boolean,
      "confidence": number (0-1),
      "reasoning": string
    }

    Inputs:
    URL: "${escapedUrl}"
    AnchorText: "${escapedAnchor}"
    PageCategory: "${pageCategory}"

    Guidance:
    - Consider domain reputation, search snippets, and likely content.
    - Adult or explicit destinations → shouldBlock=true.
    - Educational/news contexts → generally allow unless clearly explicit.
    - If uncertain after search, favor safety but reflect uncertainty in confidence.
  `;

  const text = await generateGroundedJson(prompt);
  try {
    return JSON.parse(text);
  } catch {
    const seg = extractFirstJsonSegment(text);
    if (seg) {
      try { return JSON.parse(seg); } catch {}
    }
    return { score: 5, shouldBlock: false, confidence: 0.5, reasoning: 'Unparseable grounded response' };
  }
};

module.exports = {
  generateText,
  testConnection,
  analyzeContent,
  analyzeContentBatch,
  analyzeUrlQuick,
  analyzeUrlGrounded
};
