import ApiService from './apiService.js';

class SettingsService {
  constructor() {
    this.apiService = new ApiService();
    this.settings = null;
    this.userId = null;
  }

  /**
   * Initialize settings service
   */
  async initialize() {
    try {
      // Generate or get user ID
      this.userId = await this.getUserId();
      
      // Load settings from chrome.storage first
      await this.loadFromStorage();
      
      // Sync with backend
      await this.syncWithBackend();
      
      console.log('FocusLine: Settings service initialized');
    } catch (error) {
      console.error('FocusLine: Error initializing settings service:', error);
      // Use default settings on error
      this.settings = this.getDefaultSettings();
    }
  }

  /**
   * Get or generate user ID
   */
  async getUserId() {
    try {
      const result = await chrome.storage.local.get(['userId']);
      if (result.userId) {
        return result.userId;
      }

      // Generate new user ID
      const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ userId });
      return userId;
    } catch (error) {
      console.error('FocusLine: Error getting user ID:', error);
      return 'user_default';
    }
  }

  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: true,
      tabBlockingEnabled: true,
      contentAnalysisEnabled: true,
      sensitivity: 'moderate', // 'low', 'moderate', 'high'
      blockThreshold: 7, // 1-10 scale
      cacheEnabled: true,
      notificationsEnabled: true,
      autoBlockExplicit: true,
      allowUserOverride: false
    };
  }

  /**
   * Load settings from chrome.storage
   */
  async loadFromStorage() {
    try {
      const result = await chrome.storage.sync.get(['settings']);
      this.settings = result.settings || this.getDefaultSettings();
    } catch (error) {
      console.error('FocusLine: Error loading settings from storage:', error);
      this.settings = this.getDefaultSettings();
    }
  }

  /**
   * Save settings to chrome.storage
   */
  async saveToStorage() {
    try {
      await chrome.storage.sync.set({ settings: this.settings });
    } catch (error) {
      console.error('FocusLine: Error saving settings to storage:', error);
    }
  }

  /**
   * Sync settings with backend
   */
  async syncWithBackend() {
    try {
      if (!this.userId) return;

      // Get settings from backend
      const response = await this.apiService.getSettings(this.userId);
      
      if (response.success && response.data.settings) {
        // Merge backend settings with local settings
        this.settings = { ...this.settings, ...response.data.settings };
        await this.saveToStorage();
      }
    } catch (error) {
      console.error('FocusLine: Error syncing settings with backend:', error);
      // Continue with local settings
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return this.settings || this.getDefaultSettings();
  }

  /**
   * Update settings
   */
  async updateSettings(newSettings) {
    try {
      // Update local settings
      this.settings = { ...this.settings, ...newSettings };
      
      // Save to storage
      await this.saveToStorage();
      
      // Sync with backend
      if (this.userId) {
        await this.apiService.updateSettings(this.userId, this.settings);
      }
      
      console.log('FocusLine: Settings updated:', this.settings);
    } catch (error) {
      console.error('FocusLine: Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Reset settings to default
   */
  async resetSettings() {
    try {
      this.settings = this.getDefaultSettings();
      
      // Save to storage
      await this.saveToStorage();
      
      // Sync with backend
      if (this.userId) {
        await this.apiService.resetSettings(this.userId);
      }
      
      console.log('FocusLine: Settings reset to default');
    } catch (error) {
      console.error('FocusLine: Error resetting settings:', error);
      throw error;
    }
  }

  /**
   * Get specific setting value
   */
  getSetting(key) {
    return this.settings?.[key] ?? this.getDefaultSettings()[key];
  }

  /**
   * Check if extension is enabled
   */
  isEnabled() {
    return this.getSetting('enabled');
  }

  /**
   * Check if tab blocking is enabled
   */
  isTabBlockingEnabled() {
    return this.getSetting('enabled') && this.getSetting('tabBlockingEnabled');
  }

  /**
   * Check if content analysis is enabled
   */
  isContentAnalysisEnabled() {
    return this.getSetting('enabled') && this.getSetting('contentAnalysisEnabled');
  }

  /**
   * Get sensitivity level
   */
  getSensitivity() {
    return this.getSetting('sensitivity');
  }

  /**
   * Get block threshold
   */
  getBlockThreshold() {
    return this.getSetting('blockThreshold');
  }

  /**
   * Check if notifications are enabled
   */
  areNotificationsEnabled() {
    return this.getSetting('notificationsEnabled');
  }

  /**
   * Refresh settings from storage and backend
   */
  async refreshSettings() {
    try {
      // Reload from storage
      await this.loadFromStorage();
      
      // Sync with backend
      await this.syncWithBackend();
      
      console.log('FocusLine: Settings refreshed:', this.settings);
    } catch (error) {
      console.error('FocusLine: Error refreshing settings:', error);
    }
  }
}

export default SettingsService;
