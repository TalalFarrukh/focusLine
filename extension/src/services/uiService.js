/**
 * UI Service for managing loading states, progress bars, and error messages
 * Provides a consistent user experience during content analysis
 */
class UIService {
  constructor() {
    this.loadingOverlays = new Map();
    this.progressBars = new Map();
    this.errorMessages = new Map();
    this.notifications = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the UI service
   */
  init() {
    if (this.isInitialized) return;
    
    this._injectStyles();
    this._createGlobalElements();
    this.isInitialized = true;
  }

  /**
   * Show loading indicator for a specific element or area
   * @param {string} id - Unique identifier for the loading state
   * @param {object} options - Loading options
   */
  showLoading(id, options = {}) {
    const {
      target = document.body,
      message = 'Analyzing content...',
      overlay = false,
      progress = false
    } = options;

    const loadingElement = this._createLoadingElement(id, message, overlay, progress);
    
    if (overlay) {
      target.appendChild(loadingElement);
      this.loadingOverlays.set(id, loadingElement);
    } else {
      target.appendChild(loadingElement);
      this.loadingOverlays.set(id, loadingElement);
    }
  }

  /**
   * Hide loading indicator
   * @param {string} id - Loading state identifier
   */
  hideLoading(id) {
    const loadingElement = this.loadingOverlays.get(id);
    if (loadingElement) {
      loadingElement.remove();
      this.loadingOverlays.delete(id);
    }
  }

  /**
   * Update progress bar
   * @param {string} id - Progress bar identifier
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Progress message
   */
  updateProgress(id, progress, message = '') {
    const progressElement = this.progressBars.get(id);
    if (progressElement) {
      const progressBar = progressElement.querySelector('.fl-progress-bar-fill');
      const messageElement = progressElement.querySelector('.fl-progress-message');
      
      if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      }
      
      if (messageElement && message) {
        messageElement.textContent = message;
      }
    }
  }

  /**
   * Show error message
   * @param {string} id - Error message identifier
   * @param {string} message - Error message
   * @param {string} type - Error type (error, warning, info)
   * @param {number} duration - Auto-hide duration in milliseconds
   */
  showError(id, message, type = 'error', duration = 5000) {
    const errorElement = this._createErrorElement(id, message, type);
    document.body.appendChild(errorElement);
    
    this.errorMessages.set(id, errorElement);
    
    // Auto-hide after duration
    if (duration > 0) {
      setTimeout(() => {
        this.hideError(id);
      }, duration);
    }
  }

  /**
   * Hide error message
   * @param {string} id - Error message identifier
   */
  hideError(id) {
    const errorElement = this.errorMessages.get(id);
    if (errorElement) {
      errorElement.remove();
      this.errorMessages.delete(id);
    }
  }

  /**
   * Show notification
   * @param {string} id - Notification identifier
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, info, warning)
   * @param {number} duration - Auto-hide duration
   */
  showNotification(id, message, type = 'info', duration = 3000) {
    const notificationElement = this._createNotificationElement(id, message, type);
    document.body.appendChild(notificationElement);
    
    this.notifications.set(id, notificationElement);
    
    // Auto-hide after duration
    if (duration > 0) {
      setTimeout(() => {
        this.hideNotification(id);
      }, duration);
    }
  }

  /**
   * Hide notification
   * @param {string} id - Notification identifier
   */
  hideNotification(id) {
    const notificationElement = this.notifications.get(id);
    if (notificationElement) {
      notificationElement.remove();
      this.notifications.delete(id);
    }
  }

  /**
   * Show blocking overlay for content
   * @param {Element} element - Element to block
   * @param {string} reason - Reason for blocking
   */
  showBlockingOverlay(element, reason = 'Content blocked') {
    if (!element) return;
    
    const overlay = this._createBlockingOverlay(reason);
    element.style.position = 'relative';
    element.appendChild(overlay);
    
    // Store reference for later removal
    element.setAttribute('data-fl-blocked', 'true');
    element.setAttribute('data-fl-block-reason', reason);
  }

  /**
   * Hide blocking overlay
   * @param {Element} element - Element to unblock
   */
  hideBlockingOverlay(element) {
    if (!element) return;
    
    const overlay = element.querySelector('.fl-blocking-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    element.removeAttribute('data-fl-blocked');
    element.removeAttribute('data-fl-block-reason');
  }

  /**
   * Create loading element
   * @param {string} id - Element identifier
   * @param {string} message - Loading message
   * @param {boolean} overlay - Whether to show as overlay
   * @param {boolean} progress - Whether to show progress bar
   * @returns {Element} - Loading element
   */
  _createLoadingElement(id, message, overlay, progress) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = `fl-loading ${overlay ? 'fl-loading-overlay' : 'fl-loading-inline'}`;
    loadingDiv.id = `fl-loading-${id}`;
    
    const content = `
      <div class="fl-loading-content">
        <div class="fl-loading-spinner"></div>
        <div class="fl-loading-message">${message}</div>
        ${progress ? '<div class="fl-progress-bar"><div class="fl-progress-bar-fill"></div></div>' : ''}
      </div>
    `;
    
    loadingDiv.innerHTML = content;
    
    if (progress) {
      const progressBar = loadingDiv.querySelector('.fl-progress-bar-fill');
      this.progressBars.set(id, loadingDiv);
    }
    
    return loadingDiv;
  }

  /**
   * Create error element
   * @param {string} id - Element identifier
   * @param {string} message - Error message
   * @param {string} type - Error type
   * @returns {Element} - Error element
   */
  _createErrorElement(id, message, type) {
    const errorDiv = document.createElement('div');
    errorDiv.className = `fl-error fl-error-${type}`;
    errorDiv.id = `fl-error-${id}`;
    
    errorDiv.innerHTML = `
      <div class="fl-error-content">
        <div class="fl-error-icon">⚠️</div>
        <div class="fl-error-message">${message}</div>
        <button class="fl-error-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    return errorDiv;
  }

  /**
   * Create notification element
   * @param {string} id - Element identifier
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   * @returns {Element} - Notification element
   */
  _createNotificationElement(id, message, type) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = `fl-notification fl-notification-${type}`;
    notificationDiv.id = `fl-notification-${id}`;
    
    const icons = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    };
    
    notificationDiv.innerHTML = `
      <div class="fl-notification-content">
        <div class="fl-notification-icon">${icons[type] || icons.info}</div>
        <div class="fl-notification-message">${message}</div>
        <button class="fl-notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    return notificationDiv;
  }

  /**
   * Create blocking overlay
   * @param {string} reason - Blocking reason
   * @returns {Element} - Blocking overlay element
   */
  _createBlockingOverlay(reason) {
    const overlay = document.createElement('div');
    overlay.className = 'fl-blocking-overlay';
    
    overlay.innerHTML = `
      <div class="fl-blocking-content">
        <div class="fl-blocking-icon">🚫</div>
        <div class="fl-blocking-message">${reason}</div>
      </div>
    `;
    
    return overlay;
  }

  /**
   * Inject CSS styles for UI components
   */
  _injectStyles() {
    if (document.getElementById('fl-ui-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'fl-ui-styles';
    style.textContent = `
      /* Loading Styles */
      .fl-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
      }
      
      .fl-loading-inline {
        display: inline-flex;
        align-items: center;
        padding: 10px;
      }
      
      .fl-loading-content {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        text-align: center;
      }
      
      .fl-loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: fl-spin 1s linear infinite;
        margin: 0 auto 10px;
      }
      
      .fl-loading-message {
        color: #333;
        font-size: 14px;
        margin-bottom: 10px;
      }
      
      /* Progress Bar */
      .fl-progress-bar {
        width: 200px;
        height: 6px;
        background: #f3f3f3;
        border-radius: 3px;
        overflow: hidden;
        margin: 10px auto 0;
      }
      
      .fl-progress-bar-fill {
        height: 100%;
        background: #3498db;
        width: 0%;
        transition: width 0.3s ease;
      }
      
      /* Error Messages */
      .fl-error {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-left: 4px solid #e74c3c;
        padding: 15px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 999998;
        max-width: 300px;
      }
      
      .fl-error-content {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .fl-error-icon {
        font-size: 18px;
      }
      
      .fl-error-message {
        flex: 1;
        font-size: 14px;
        color: #333;
      }
      
      .fl-error-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #999;
      }
      
      /* Notifications */
      .fl-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 999998;
        max-width: 300px;
        animation: fl-slide-in 0.3s ease;
      }
      
      .fl-notification-content {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .fl-notification-icon {
        font-size: 18px;
      }
      
      .fl-notification-message {
        flex: 1;
        font-size: 14px;
        color: #333;
      }
      
      .fl-notification-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #999;
      }
      
      /* Blocking Overlay */
      .fl-blocking-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      
      .fl-blocking-content {
        background: white;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
      }
      
      .fl-blocking-icon {
        font-size: 24px;
        margin-bottom: 8px;
      }
      
      .fl-blocking-message {
        font-size: 12px;
        color: #333;
      }
      
      /* Animations */
      @keyframes fl-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes fl-slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Create global elements
   */
  _createGlobalElements() {
    // Create global container for notifications
    const container = document.createElement('div');
    container.id = 'fl-ui-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999998;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  /**
   * Clean up all UI elements
   */
  cleanup() {
    // Remove all loading overlays
    this.loadingOverlays.forEach((element, id) => {
      this.hideLoading(id);
    });
    
    // Remove all error messages
    this.errorMessages.forEach((element, id) => {
      this.hideError(id);
    });
    
    // Remove all notifications
    this.notifications.forEach((element, id) => {
      this.hideNotification(id);
    });
    
    // Remove global container
    const container = document.getElementById('fl-ui-container');
    if (container) {
      container.remove();
    }
    
    // Remove styles
    const styles = document.getElementById('fl-ui-styles');
    if (styles) {
      styles.remove();
    }
    
    this.isInitialized = false;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIService;
} else {
  // For browser environment
  window.UIService = UIService;
}
