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
    
    // Find all link elements within this container that need to be blocked
    const linkElements = this._findLinkElementsToBlock(element);
    
    // Create and apply blocking overlay to the main element
    const overlay = this._createBlockingOverlay(reason);
    element.style.position = 'relative';
    element.appendChild(overlay);
    
    // Make the main element unclickable
    element.style.pointerEvents = 'none';
    element.style.userSelect = 'none';
    
    // Store reference for later removal
    element.setAttribute('data-fl-blocked', 'true');
    element.setAttribute('data-fl-block-reason', reason);
    
    // Add event listeners to prevent any interactions on the main element
    const preventInteraction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };
    
    // Store the event handler for later removal
    element._flPreventInteraction = preventInteraction;
    
    // Prevent all types of interactions
    const events = [
      'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
      'touchstart', 'touchend', 'touchmove', 'touchcancel',
      'keydown', 'keyup', 'keypress',
      'focus', 'blur', 'focusin', 'focusout',
      'submit', 'change', 'input'
    ];
    
    events.forEach(eventType => {
      element.addEventListener(eventType, preventInteraction, true);
    });
    
    // Block all link elements found within this container
    linkElements.forEach(linkElement => {
      this._blockLinkElement(linkElement, reason);
    });
    
    // Also prevent interactions on all child elements
    const childElements = element.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.pointerEvents = 'none';
      child.style.userSelect = 'none';
    });
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
    
    // Restore element's clickability
    element.style.pointerEvents = '';
    element.style.userSelect = '';
    
    // Remove event listeners if they were added
    if (element._flPreventInteraction) {
      const preventInteraction = element._flPreventInteraction;
      const events = [
        'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
        'touchstart', 'touchend', 'touchmove', 'touchcancel',
        'keydown', 'keyup', 'keypress',
        'focus', 'blur', 'focusin', 'focusout',
        'submit', 'change', 'input'
      ];
      
      events.forEach(eventType => {
        element.removeEventListener(eventType, preventInteraction, true);
      });
      
      // Clean up the stored handler
      delete element._flPreventInteraction;
    }
    
    // Unblock all link elements within this container
    const blockedLinks = element.querySelectorAll('[data-fl-link-blocked="true"]');
    blockedLinks.forEach(linkElement => {
      this._unblockLinkElement(linkElement);
    });
    
    // Restore interactions on all child elements
    const childElements = element.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.pointerEvents = '';
      child.style.userSelect = '';
    });
    
    element.removeAttribute('data-fl-blocked');
    element.removeAttribute('data-fl-block-reason');
  }

  /**
   * Check if an element is blocked
   * @param {Element} element - Element to check
   * @returns {boolean} - True if element is blocked
   */
  isElementBlocked(element) {
    return element && element.getAttribute('data-fl-blocked') === 'true';
  }

  /**
   * Get blocking reason for an element
   * @param {Element} element - Element to check
   * @returns {string|null} - Blocking reason or null if not blocked
   */
  getBlockingReason(element) {
    return element ? element.getAttribute('data-fl-block-reason') : null;
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
        pointer-events: auto;
        cursor: not-allowed;
      }
      
      .fl-blocking-content {
        background: white;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
        pointer-events: auto;
        cursor: not-allowed;
      }
      
      .fl-blocking-icon {
        font-size: 24px;
        margin-bottom: 8px;
      }
      
      .fl-blocking-message {
        font-size: 12px;
        color: #333;
      }
      
      /* Blocked Link Styles */
      a[data-fl-link-blocked="true"] {
        pointer-events: none !important;
        user-select: none !important;
        text-decoration: line-through !important;
        color: #999 !important;
        cursor: not-allowed !important;
        opacity: 0.6;
        position: relative;
      }
      
      a[data-fl-link-blocked="true"]::before {
        content: "🚫";
        position: absolute;
        top: -2px;
        right: -2px;
        font-size: 12px;
        background: white;
        border-radius: 50%;
        padding: 1px;
        z-index: 1001;
      }
      
      a[data-fl-link-blocked="true"] * {
        pointer-events: none !important;
        user-select: none !important;
      }
      
      /* Search Result Link Blocking */
      [data-fl-link-blocked="true"] {
        pointer-events: none !important;
        user-select: none !important;
        text-decoration: line-through !important;
        color: #999 !important;
        cursor: not-allowed !important;
        opacity: 0.6 !important;
        position: relative !important;
      }
      
      [data-fl-link-blocked="true"] * {
        pointer-events: none !important;
        user-select: none !important;
      }
      
      /* Blocked Clickable Elements */
      [data-fl-element-blocked="true"] {
        pointer-events: none !important;
        user-select: none !important;
        text-decoration: line-through !important;
        color: #999 !important;
        cursor: not-allowed !important;
        opacity: 0.6 !important;
        position: relative !important;
      }
      
      [data-fl-element-blocked="true"] * {
        pointer-events: none !important;
        user-select: none !important;
      }
      
      .fl-link-block-indicator {
        position: absolute;
        top: -2px;
        right: -2px;
        font-size: 12px;
        background: white;
        border-radius: 50%;
        padding: 1px;
        z-index: 1001;
        pointer-events: none;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      
      /* Search Result Container Blocking */
      [data-fl-blocked="true"] {
        position: relative !important;
      }
      
      [data-fl-blocked="true"] .fl-blocking-overlay {
        z-index: 1000 !important;
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
    
    // Remove all blocking overlays
    const blockedElements = document.querySelectorAll('[data-fl-blocked="true"]');
    blockedElements.forEach(element => {
      this.hideBlockingOverlay(element);
    });
    
    // Also unblock any individual link elements that might be blocked
    const blockedLinks = document.querySelectorAll('[data-fl-link-blocked="true"]');
    blockedLinks.forEach(linkElement => {
      this._unblockLinkElement(linkElement);
    });
    
    // Also unblock any blocked clickable elements
    const blockedClickableElements = document.querySelectorAll('[data-fl-element-blocked="true"]');
    blockedClickableElements.forEach(element => {
      this._unblockClickableElement(element);
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

  /**
   * Find link elements within a container that need to be blocked
   * @param {Element} container - Container element to search within
   * @returns {Array<Element>} - Array of link elements to block
   */
  _findLinkElementsToBlock(container) {
    const linkElements = [];
    
    // Find all anchor tags within the container
    const anchors = container.querySelectorAll('a[href]');
    
    anchors.forEach(anchor => {
      // Check if this anchor contains text that might be inappropriate
      const anchorText = anchor.textContent.trim().toLowerCase();
      const href = anchor.href.toLowerCase();
      
      // Common patterns for search result links that should be blocked
      const isSearchResultLink = anchor.closest('[class*="result"], [class*="search"], [class*="item"], [class*="g"], [class*="rc"]') !== null;
      const hasInappropriateText = this._containsInappropriateText(anchorText);
      const hasInappropriateUrl = this._containsInappropriateText(href);
      
      // Block if it's a search result link or contains inappropriate content
      if (isSearchResultLink || hasInappropriateText || hasInappropriateUrl) {
        linkElements.push(anchor);
      }
    });
    
    // Also check for any clickable elements that might be links
    const clickableElements = container.querySelectorAll('[onclick], [role="link"], [tabindex]');
    clickableElements.forEach(element => {
      const elementText = element.textContent.trim().toLowerCase();
      const hasInappropriateText = this._containsInappropriateText(elementText);
      
      if (hasInappropriateText) {
        linkElements.push(element);
      }
    });
    
    return linkElements;
  }
  
  /**
   * Check if text contains inappropriate content patterns
   * @param {string} text - Text to check
   * @returns {boolean} - True if text contains inappropriate patterns
   */
  _containsInappropriateText(text) {
    const inappropriatePatterns = [
      'porn', 'sex', 'adult', 'xxx', 'nude', 'naked', 'explicit',
      'pornhub', 'xvideos', 'redtube', 'youporn', 'xnxx',
      'hardcore', 'softcore', 'mature', 'teen', 'milf'
    ];
    
    return inappropriatePatterns.some(pattern => text.includes(pattern));
  }
  
  /**
   * Block a specific link element
   * @param {Element} linkElement - Link element to block
   * @param {string} reason - Reason for blocking
   */
  _blockLinkElement(linkElement, reason) {
    if (!linkElement) return;
    
    // Store original styles for restoration
    linkElement._flOriginalStyles = {
      pointerEvents: linkElement.style.pointerEvents,
      userSelect: linkElement.style.userSelect,
      textDecoration: linkElement.style.textDecoration,
      color: linkElement.style.color,
      cursor: linkElement.style.cursor
    };
    
    // Make link completely unclickable and visually indicate it's blocked
    linkElement.style.pointerEvents = 'none';
    linkElement.style.userSelect = 'none';
    linkElement.style.textDecoration = 'line-through';
    linkElement.style.color = '#999';
    linkElement.style.cursor = 'not-allowed';
    
    // Add blocking indicator to the link
    linkElement.setAttribute('data-fl-link-blocked', 'true');
    linkElement.setAttribute('data-fl-block-reason', reason);
    
    // Add event listeners to prevent any interactions
    const preventInteraction = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };
    
    // Store the event handler for later removal
    linkElement._flPreventInteraction = preventInteraction;
    
    // Prevent all types of interactions on the link
    const events = [
      'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
      'touchstart', 'touchend', 'touchmove', 'touchcancel',
      'keydown', 'keyup', 'keypress',
      'focus', 'blur', 'focusin', 'focusout'
    ];
    
    events.forEach(eventType => {
      linkElement.addEventListener(eventType, preventInteraction, true);
    });
    
    // Also block all child elements of the link
    const childElements = linkElement.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.pointerEvents = 'none';
      child.style.userSelect = 'none';
    });
  }
  
  /**
   * Unblock a specific link element
   * @param {Element} linkElement - Link element to unblock
   */
  _unblockLinkElement(linkElement) {
    if (!linkElement) return;
    
    // Restore original styles
    if (linkElement._flOriginalStyles) {
      linkElement.style.pointerEvents = linkElement._flOriginalStyles.pointerEvents;
      linkElement.style.userSelect = linkElement._flOriginalStyles.userSelect;
      linkElement.style.textDecoration = linkElement._flOriginalStyles.textDecoration;
      linkElement.style.color = linkElement._flOriginalStyles.color;
      linkElement.style.cursor = linkElement._flOriginalStyles.cursor;
      linkElement.style.opacity = linkElement._flOriginalStyles.opacity;
      
      delete linkElement._flOriginalStyles;
    }
    
    // Remove event listeners if they were added
    if (linkElement._flPreventInteraction) {
      const preventInteraction = linkElement._flPreventInteraction;
      const events = [
        'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
        'touchstart', 'touchend', 'touchmove', 'touchcancel',
        'keydown', 'keyup', 'keypress',
        'focus', 'blur', 'focusin', 'focusout'
      ];
      
      events.forEach(eventType => {
        linkElement.removeEventListener(eventType, preventInteraction, true);
      });
      
      delete linkElement._flPreventInteraction;
    }
    
    // Restore interactions on all child elements
    const childElements = linkElement.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.pointerEvents = '';
      child.style.userSelect = '';
    });
    
    // Remove blocking attributes
    linkElement.removeAttribute('data-fl-link-blocked');
    linkElement.removeAttribute('data-fl-block-reason');
  }
  
  /**
   * Unblock a clickable element
   * @param {Element} element - Clickable element to unblock
   */
  _unblockClickableElement(element) {
    if (!element) return;
    
    // Restore original styles
    if (element._flOriginalStyles) {
      element.style.pointerEvents = element._flOriginalStyles.pointerEvents;
      element.style.userSelect = element._flOriginalStyles.userSelect;
      element.style.textDecoration = element._flOriginalStyles.textDecoration;
      element.style.color = element._flOriginalStyles.color;
      element.style.cursor = element._flOriginalStyles.cursor;
      element.style.opacity = element._flOriginalStyles.opacity;
      
      delete element._flOriginalStyles;
    }
    
    // Remove event listeners if they were added
    if (element._flPreventInteraction) {
      const preventInteraction = element._flPreventInteraction;
      const events = [
        'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
        'touchstart', 'touchend', 'touchmove', 'touchcancel',
        'keydown', 'keyup', 'keypress',
        'focus', 'blur', 'focusin', 'focusout'
      ];
      
      events.forEach(eventType => {
        element.removeEventListener(eventType, preventInteraction, true);
      });
      
      delete element._flPreventInteraction;
    }
    
    // Restore interactions on all child elements
    const childElements = element.querySelectorAll('*');
    childElements.forEach(child => {
      child.style.pointerEvents = '';
      child.style.userSelect = '';
    });
    
    // Remove blocking indicator
    const indicator = element.querySelector('.fl-link-block-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    // Remove blocking attributes
    element.removeAttribute('data-fl-element-blocked');
    element.removeAttribute('data-fl-block-reason');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIService;
} else {
  // For browser environment
  window.UIService = UIService;
}
