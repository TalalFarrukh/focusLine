class ApiService {
  constructor() {
    this.baseUrl = 'http://localhost:3000/api/v1';
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.timeout = 10000;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this._makeSingleRequest(url, options);

        if (response.ok) {
          return await response.json();
        } else {
          // Don't retry on 429 (rate limit) or 4xx client errors
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 1 minute
            console.warn(`Rate limited. Waiting ${delay}ms before next request.`);
            await this._delay(delay);
            throw new Error(`Rate limit exceeded. Please try again later.`);
          } else if (response.status >= 400 && response.status < 500) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        }
      } catch (error) {
        lastError = error;
        console.warn(`API request attempt ${attempt} failed:`, error.message);
        
        // Don't retry on rate limit errors
        if (error.message.includes('Rate limit') || error.message.includes('429')) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          await this._delay(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(
      `API request failed after ${this.maxRetries} attempts: ${lastError.message}`
    );
  }

  async _makeSingleRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        ...options
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testConnection() {
    return this.makeRequest('/health');
  }

  async testGeminiConnection() {
    return this.makeRequest('/gemini/test-connection');
  }

  async analyzeContent(text) {
    return this.makeRequest('/gemini/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
  }

  async analyzeContentBatch(items) {
    return this.makeRequest('/gemini/analyze-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ items })
    });
  }

  /**
   * Analyze URL with AI (for tab blocking)
   */
  async analyzeUrl(url) {
    try {
      const response = await this.makeRequest('/gemini/analyze-url', {
        method: 'POST',
        body: JSON.stringify({
          url,
          grounded: true // Use Google Search grounding by default
        })
      });

      return response;
    } catch (error) {
      console.error('FocusLine: Error analyzing URL:', error);
      throw error;
    }
  }

  /**
   * Get user settings
   */
  async getSettings(userId) {
    try {
      const response = await this.makeRequest(`/settings/${userId}`, {
        method: 'GET'
      });

      return response;
    } catch (error) {
      console.error('FocusLine: Error getting settings:', error);
      throw error;
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(userId, settings) {
    try {
      const response = await this.makeRequest(`/settings/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ settings })
      });

      return response;
    } catch (error) {
      console.error('FocusLine: Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Reset user settings to default
   */
  async resetSettings(userId) {
    try {
      const response = await this.makeRequest(`/settings/${userId}`, {
        method: 'DELETE'
      });

      return response;
    } catch (error) {
      console.error('FocusLine: Error resetting settings:', error);
      throw error;
    }
  }
}

export default ApiService;