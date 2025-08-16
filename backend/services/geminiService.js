const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load API key from environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("❌ Missing GEMINI_API_KEY in environment variables");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
    } else if (error.message.includes("quota")) {
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

module.exports = {
  generateText,
  testConnection,
  analyzeContent
};
