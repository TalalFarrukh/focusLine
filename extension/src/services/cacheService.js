class CacheService {
  constructor() {
    this.dbName = 'FocusLineCache';
    this.dbVersion = 1;
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async initialize() {
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = () => {
          console.error('FocusLine: Failed to open IndexedDB:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;
          console.log('FocusLine: IndexedDB initialized successfully');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Create URL cache store
          if (!db.objectStoreNames.contains('urlCache')) {
            const urlStore = db.createObjectStore('urlCache', { keyPath: 'url' });
            urlStore.createIndex('timestamp', 'timestamp', { unique: false });
            urlStore.createIndex('domain', 'domain', { unique: false });
          }

          // Create content cache store
          if (!db.objectStoreNames.contains('contentCache')) {
            const contentStore = db.createObjectStore('contentCache', { keyPath: 'hash' });
            contentStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          console.log('FocusLine: IndexedDB schema created');
        };
      });
    } catch (error) {
      console.error('FocusLine: Error initializing IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Get URL from cache
   */
  async getUrlCache(url) {
    try {
      if (!this.db) await this.initialize();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['urlCache'], 'readonly');
        const store = transaction.objectStore('urlCache');
        const request = store.get(url);

        request.onsuccess = () => {
          const result = request.result;
          if (result && this.isCacheValid(result.timestamp, 24 * 60 * 60 * 1000)) { // 24 hours
            resolve(result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('FocusLine: Error getting URL from cache:', request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error('FocusLine: Error getting URL from cache:', error);
      return null;
    }
  }

  /**
   * Set URL in cache
   */
  async setUrlCache(url, data) {
    try {
      if (!this.db) await this.initialize();

      const domain = this.extractDomain(url);
      const cacheEntry = {
        url,
        domain,
        data,
        timestamp: Date.now()
      };

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['urlCache'], 'readwrite');
        const store = transaction.objectStore('urlCache');
        const request = store.put(cacheEntry);

        request.onsuccess = () => {
          console.log('FocusLine: URL cached:', url);
          resolve();
        };

        request.onerror = () => {
          console.error('FocusLine: Error setting URL in cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('FocusLine: Error setting URL in cache:', error);
    }
  }

  /**
   * Get content from cache
   */
  async getContentCache(hash) {
    try {
      if (!this.db) await this.initialize();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['contentCache'], 'readonly');
        const store = transaction.objectStore('contentCache');
        const request = store.get(hash);

        request.onsuccess = () => {
          const result = request.result;
          if (result && this.isCacheValid(result.timestamp, 12 * 60 * 60 * 1000)) { // 12 hours
            resolve(result.data);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('FocusLine: Error getting content from cache:', request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error('FocusLine: Error getting content from cache:', error);
      return null;
    }
  }

  /**
   * Set content in cache
   */
  async setContentCache(hash, data) {
    try {
      if (!this.db) await this.initialize();

      const cacheEntry = {
        hash,
        data,
        timestamp: Date.now()
      };

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['contentCache'], 'readwrite');
        const store = transaction.objectStore('contentCache');
        const request = store.put(cacheEntry);

        request.onsuccess = () => {
          console.log('FocusLine: Content cached:', hash);
          resolve();
        };

        request.onerror = () => {
          console.error('FocusLine: Error setting content in cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('FocusLine: Error setting content in cache:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    try {
      if (!this.db) await this.initialize();

      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      // Clear expired URL cache
      await this.clearExpiredStore('urlCache', now, maxAge);
      
      // Clear expired content cache
      await this.clearExpiredStore('contentCache', now, maxAge);

      console.log('FocusLine: Expired cache entries cleared');
    } catch (error) {
      console.error('FocusLine: Error clearing expired cache:', error);
    }
  }

  /**
   * Clear expired entries from a specific store
   */
  async clearExpiredStore(storeName, now, maxAge) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('timestamp');
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (now - cursor.value.timestamp > maxAge) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear all cache
   */
  async clearAllCache() {
    try {
      if (!this.db) await this.initialize();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['urlCache', 'contentCache'], 'readwrite');
        
        transaction.oncomplete = () => {
          console.log('FocusLine: All cache cleared');
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };

        // Clear URL cache
        const urlStore = transaction.objectStore('urlCache');
        urlStore.clear();

        // Clear content cache
        const contentStore = transaction.objectStore('contentCache');
        contentStore.clear();
      });
    } catch (error) {
      console.error('FocusLine: Error clearing all cache:', error);
      throw error;
    }
  }

  /**
   * Check if cache entry is still valid
   */
  isCacheValid(timestamp, maxAge) {
    return Date.now() - timestamp < maxAge;
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }

  /**
   * Generate content hash
   */
  generateContentHash(content) {
    let hash = 0;
    if (content.length === 0) return hash.toString();
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString();
  }
}

export default CacheService;
