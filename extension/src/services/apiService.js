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
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;
        console.warn(`API request attempt ${attempt} failed:`, error.message);
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

  async analyzeUrl(url, content = '') {
    return this.makeRequest('/gemini/analyze-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, content })
    });
  }

  async getSettings() {
    return this.makeRequest('/settings');
  }

  async updateSettings(settings) {
    return this.makeRequest('/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });
  }
}

export default ApiService;