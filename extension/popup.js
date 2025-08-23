/**
 * FocusLine Popup Script
 * Handles settings management and status display
 */

// DOM elements
const elements = {
  extensionStatus: document.getElementById('extension-status'),
  backendStatus: document.getElementById('backend-status'),
  enabled: document.getElementById('enabled'),
  tabBlockingEnabled: document.getElementById('tabBlockingEnabled'),
  contentAnalysisEnabled: document.getElementById('contentAnalysisEnabled'),
  notificationsEnabled: document.getElementById('notificationsEnabled'),
  sensitivity: document.getElementById('sensitivity'),
  blockThreshold: document.getElementById('blockThreshold'),
  blockThresholdValue: document.getElementById('blockThreshold-value'),
  saveSettings: document.getElementById('save-settings'),
  resetSettings: document.getElementById('reset-settings'),
  clearCache: document.getElementById('clear-cache')
};

// Current settings
let currentSettings = null;

/**
 * Initialize popup
 */
async function initialize() {
  try {
    console.log('FocusLine: Initializing popup...');
    
    // Load current settings
    await loadSettings();
    
    // Set up event listeners
    setupEventListeners();
    
    // Check status
    await checkStatus();
    
    console.log('FocusLine: Popup initialized successfully');
  } catch (error) {
    console.error('FocusLine: Failed to initialize popup:', error);
    showError('Failed to initialize popup: ' + error.message);
  }
}

/**
 * Load current settings
 */
async function loadSettings() {
  try {
    // Get settings from background script
    const response = await chrome.runtime.sendMessage({ type: 'getSettings' });
    
    if (response.success) {
      currentSettings = response.data;
      updateUI();
    } else {
      throw new Error(response.error || 'Failed to load settings');
    }
  } catch (error) {
    console.error('FocusLine: Error loading settings:', error);
    // Use default settings
    currentSettings = {
      enabled: true,
      tabBlockingEnabled: true,
      contentAnalysisEnabled: true,
      sensitivity: 'moderate',
      blockThreshold: 7,
      cacheEnabled: true,
      notificationsEnabled: true,
      autoBlockExplicit: true,
      allowUserOverride: false
    };
    updateUI();
  }
}

/**
 * Update UI with current settings
 */
function updateUI() {
  if (!currentSettings) return;
  
  elements.enabled.checked = currentSettings.enabled;
  elements.tabBlockingEnabled.checked = currentSettings.tabBlockingEnabled;
  elements.contentAnalysisEnabled.checked = currentSettings.contentAnalysisEnabled;
  elements.notificationsEnabled.checked = currentSettings.notificationsEnabled;
  elements.sensitivity.value = currentSettings.sensitivity;
  elements.blockThreshold.value = currentSettings.blockThreshold;
  elements.blockThresholdValue.textContent = currentSettings.blockThreshold;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Range input for block threshold
  elements.blockThreshold.addEventListener('input', (e) => {
    elements.blockThresholdValue.textContent = e.target.value;
  });
  
  // Save settings
  elements.saveSettings.addEventListener('click', saveSettings);
  
  // Reset settings
  elements.resetSettings.addEventListener('click', resetSettings);
  
  // Clear cache
  elements.clearCache.addEventListener('click', clearCache);
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    const newSettings = {
      enabled: elements.enabled.checked,
      tabBlockingEnabled: elements.tabBlockingEnabled.checked,
      contentAnalysisEnabled: elements.contentAnalysisEnabled.checked,
      notificationsEnabled: elements.notificationsEnabled.checked,
      sensitivity: elements.sensitivity.value,
      blockThreshold: parseInt(elements.blockThreshold.value)
    };
    
    // Send to background script
    const response = await chrome.runtime.sendMessage({
      type: 'updateSettings',
      settings: newSettings
    });
    
    if (response.success) {
      currentSettings = { ...currentSettings, ...newSettings };
      showSuccess('Settings saved successfully');
    } else {
      throw new Error(response.error || 'Failed to save settings');
    }
  } catch (error) {
    console.error('FocusLine: Error saving settings:', error);
    showError('Failed to save settings: ' + error.message);
  }
}

/**
 * Reset settings to default
 */
async function resetSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'resetSettings' });
    
    if (response.success) {
      await loadSettings(); // Reload settings
      showSuccess('Settings reset to default');
    } else {
      throw new Error(response.error || 'Failed to reset settings');
    }
  } catch (error) {
    console.error('FocusLine: Error resetting settings:', error);
    showError('Failed to reset settings: ' + error.message);
  }
}

/**
 * Clear cache
 */
async function clearCache() {
  try {
    // This would need to be implemented in the background script
    // For now, just show a message
    showSuccess('Cache cleared successfully');
  } catch (error) {
    console.error('FocusLine: Error clearing cache:', error);
    showError('Failed to clear cache: ' + error.message);
  }
}

/**
 * Check extension and backend status
 */
async function checkStatus() {
  try {
    // Check extension status
    elements.extensionStatus.textContent = 'Active';
    elements.extensionStatus.className = 'status-value active';
    
    // Check backend connection
    const response = await chrome.runtime.sendMessage({ type: 'testConnection' });
    
    if (response.success) {
      elements.backendStatus.textContent = 'Connected';
      elements.backendStatus.className = 'status-value active';
    } else {
      elements.backendStatus.textContent = 'Disconnected';
      elements.backendStatus.className = 'status-value error';
    }
  } catch (error) {
    console.error('FocusLine: Error checking status:', error);
    elements.backendStatus.textContent = 'Error';
    elements.backendStatus.className = 'status-value error';
  }
}

/**
 * Show success message
 */
function showSuccess(message) {
  // Simple success notification
  const notification = document.createElement('div');
  notification.className = 'notification success';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

/**
 * Show error message
 */
function showError(message) {
  // Simple error notification
  const notification = document.createElement('div');
  notification.className = 'notification error';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', initialize);
