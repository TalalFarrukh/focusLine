/**
 * FocusLine Popup Script
 * Handles popup UI interactions and settings management
 */
import SettingsService from './services/settingsService.js';

// DOM elements
const elements = {
  // Status elements
  extensionStatus: document.getElementById('extension-status'),
  backendStatus: document.getElementById('backend-status'),

  // Settings elements
  enabledToggle: document.getElementById('enabled'),
  tabBlockingToggle: document.getElementById('tabBlockingEnabled'),
  contentFilteringToggle: document.getElementById('contentAnalysisEnabled'),
  notificationsToggle: document.getElementById('notificationsEnabled'),
  sensitivitySelect: document.getElementById('sensitivity'),
  blockThresholdRange: document.getElementById('blockThreshold'),
  blockThresholdValue: document.getElementById('blockThreshold-value'),

  // Action buttons
  saveSettings: document.getElementById('save-settings'),
  resetSettings: document.getElementById('reset-settings'),
  clearCache: document.getElementById('clear-cache'),

  // Action buttons (these don't exist in current HTML, but keeping for future use)
  testConnectionBtn: null,
  analyzeCurrentPageBtn: null,
  refreshStatusBtn: null,

  // Statistics elements (these don't exist in current HTML, but keeping for future use)
  pagesAnalyzed: null,
  contentBlocked: null,
  tabsBlocked: null,

  // Status message (this doesn't exist in current HTML, but keeping for future use)
  statusMessage: null
};

// Settings service instance
const settingsService = new SettingsService();

/**
 * Initialize popup
 */
async function initialize() {
  try {
    console.log('FocusLine: Initializing popup...');

    // Initialize settings service (this will sync with backend)
    await settingsService.initialize();

    // Load current settings
    await loadSettings();

    // Set up event listeners
    setupEventListeners();

    // Check status
    await checkStatus();

    console.log('FocusLine: Popup initialized successfully');

  } catch (error) {
    console.error('FocusLine: Failed to initialize popup:', error);
    showStatusMessage('Failed to initialize popup', 'error');
  }
}

/**
 * Load settings from SettingsService (which syncs with backend)
 */
async function loadSettings() {
  try {
    // Get settings from SettingsService (includes backend sync)
    const settings = settingsService.getSettings();
    
    // Update UI with current settings
    elements.enabledToggle.checked = settings.enabled;
    elements.tabBlockingToggle.checked = settings.tabBlockingEnabled;
    elements.contentFilteringToggle.checked = settings.contentAnalysisEnabled;
    elements.notificationsToggle.checked = settings.notificationsEnabled;
    elements.sensitivitySelect.value = settings.sensitivity;
    elements.blockThresholdRange.value = settings.blockThreshold || 7;
    elements.blockThresholdValue.textContent = settings.blockThreshold || 7;
    
    // Update disabled state and visual appearance based on master switch
    updateDisabledState(settings.enabled);

    console.log('FocusLine: Settings loaded from backend', settings);

  } catch (error) {
    console.error('FocusLine: Failed to load settings', error);
    showStatusMessage('Failed to load settings', 'error');
  }
}

/**
 * Save settings using SettingsService (which syncs with backend)
 */
async function saveSettings() {
  try {
    // Get current UI state
    const newSettings = {
      enabled: elements.enabledToggle.checked,
      tabBlockingEnabled: elements.tabBlockingToggle.checked,
      contentAnalysisEnabled: elements.contentFilteringToggle.checked,
      notificationsEnabled: elements.notificationsToggle.checked,
      sensitivity: elements.sensitivitySelect.value,
      blockThreshold: parseInt(elements.blockThresholdRange.value)
    };

    // Update settings via SettingsService (this will sync with backend)
    await settingsService.updateSettings(newSettings);

    // Notify background script
    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      settings: newSettings
    });

    // Notify content scripts
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'settingsChanged',
          settings: newSettings
        });
      } catch (error) {
        // Tab might not have content script, ignore
      }
    }

    showSuccess('Settings saved and synced');
    console.log('FocusLine: Settings saved and synced with backend');

  } catch (error) {
    console.error('FocusLine: Failed to save settings:', error);
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
    const response = await chrome.runtime.sendMessage({ type: 'clearCache' });
    
    if (response.success) {
      showSuccess('Cache cleared successfully');
    } else {
      throw new Error(response.error || 'Failed to clear cache');
    }
  } catch (error) {
    console.error('FocusLine: Error clearing cache:', error);
    showError('Failed to clear cache: ' + error.message);
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Settings toggles
  elements.enabledToggle.addEventListener('change', handleEnabledToggle);
  elements.tabBlockingToggle.addEventListener('change', handleTabBlockingToggle);
  elements.contentFilteringToggle.addEventListener('change', handleContentFilteringToggle);
  elements.notificationsToggle.addEventListener('change', handleNotificationsToggle);
  elements.sensitivitySelect.addEventListener('change', handleSensitivityChange);
  elements.blockThresholdRange.addEventListener('input', handleBlockThresholdChange);

  // Manual action buttons
  if (elements.saveSettings) {
    elements.saveSettings.addEventListener('click', saveSettings);
  }
  if (elements.resetSettings) {
    elements.resetSettings.addEventListener('click', resetSettings);
  }
  if (elements.clearCache) {
    elements.clearCache.addEventListener('click', clearCache);
  }

  // Action buttons (only add listeners if elements exist)
  if (elements.testConnectionBtn) {
    elements.testConnectionBtn.addEventListener('click', handleTestConnection);
  }
  if (elements.analyzeCurrentPageBtn) {
    elements.analyzeCurrentPageBtn.addEventListener('click', handleAnalyzeCurrentPage);
  }
  if (elements.refreshStatusBtn) {
    elements.refreshStatusBtn.addEventListener('click', handleRefreshStatus);
  }
}

/**
 * Update disabled state and visual appearance of settings
 */
function updateDisabledState(isMasterEnabled) {
  // Get the setting group containers
  const tabBlockingGroup = elements.tabBlockingToggle.closest('.setting-group');
  const contentAnalysisGroup = elements.contentFilteringToggle.closest('.setting-group');
  const sensitivityGroup = elements.sensitivitySelect.closest('.setting-group');
  const blockThresholdGroup = elements.blockThresholdRange.closest('.setting-group');
  
  if (!isMasterEnabled) {
    // Disable controls
    elements.tabBlockingToggle.disabled = true;
    elements.contentFilteringToggle.disabled = true;
    elements.sensitivitySelect.disabled = true;
    elements.blockThresholdRange.disabled = true;
    
    // Add disabled visual state
    tabBlockingGroup.classList.add('disabled');
    contentAnalysisGroup.classList.add('disabled');
    sensitivityGroup.classList.add('disabled');
    blockThresholdGroup.classList.add('disabled');
  } else {
    // Enable controls
    elements.tabBlockingToggle.disabled = false;
    elements.contentFilteringToggle.disabled = false;
    elements.sensitivitySelect.disabled = false;
    elements.blockThresholdRange.disabled = false;
    
    // Remove disabled visual state
    tabBlockingGroup.classList.remove('disabled');
    contentAnalysisGroup.classList.remove('disabled');
    sensitivityGroup.classList.remove('disabled');
    blockThresholdGroup.classList.remove('disabled');
  }
}

/**
 * Handle enabled toggle
 */
function handleEnabledToggle() {
  const isEnabled = elements.enabledToggle.checked;
  
  if (!isEnabled) {
    // When disabling master switch, automatically disable other settings
    elements.tabBlockingToggle.checked = false;
    elements.contentFilteringToggle.checked = false;
  }
  
  // Update disabled state and visual appearance
  updateDisabledState(isEnabled);
  
  // Auto-save if no manual save button, otherwise let user save manually
  if (!elements.saveSettings) {
    saveSettings();
  }
}

/**
 * Handle tab blocking toggle
 */
function handleTabBlockingToggle() {
  // Only allow changes if master switch is enabled
  if (!elements.enabledToggle.checked) {
    elements.tabBlockingToggle.checked = false;
    return;
  }
  
  // Auto-save if no manual save button, otherwise let user save manually
  if (!elements.saveSettings) {
    saveSettings();
  }
}

/**
 * Handle content filtering toggle
 */
function handleContentFilteringToggle() {
  // Only allow changes if master switch is enabled
  if (!elements.enabledToggle.checked) {
    elements.contentFilteringToggle.checked = false;
    return;
  }
  
  // Auto-save if no manual save button, otherwise let user save manually
  if (!elements.saveSettings) {
    saveSettings();
  }
}

/**
 * Handle notifications toggle
 */
function handleNotificationsToggle() {
  // Only allow changes if master switch is enabled
  if (!elements.enabledToggle.checked) {
    elements.notificationsToggle.checked = false;
    return;
  }
  
  // Auto-save if no manual save button, otherwise let user save manually
  if (!elements.saveSettings) {
    saveSettings();
  }
}

/**
 * Handle sensitivity change
 */
function handleSensitivityChange() {
  // Only allow changes if master switch is enabled
  if (!elements.enabledToggle.checked) {
    return;
  }
  
  // Auto-save if no manual save button, otherwise let user save manually
  if (!elements.saveSettings) {
    saveSettings();
  }
}

/**
 * Handle block threshold change
 */
function handleBlockThresholdChange() {
  // Only allow changes if master switch is enabled
  if (!elements.enabledToggle.checked) {
    return;
  }
  
  // Update the display value
  elements.blockThresholdValue.textContent = elements.blockThresholdRange.value;
  
  // Auto-save if no manual save button, otherwise let user save manually
  if (!elements.saveSettings) {
    saveSettings();
  }
}

/**
 * Handle test connection button
 */
async function handleTestConnection() {
  if (!elements.testConnectionBtn) return;
  
  try {
    elements.testConnectionBtn.disabled = true;
    elements.testConnectionBtn.textContent = 'Testing...';

    const result = await chrome.runtime.sendMessage({
      type: 'testConnection'
    });

    if (result && (result.status === 'ok' || result.success)) {
      showStatusMessage('Connection test successful', 'success');
      await checkStatus();
    } else {
      showStatusMessage('Connection test failed', 'error');
    }

  } catch (error) {
    console.error('FocusLine: Test connection failed:', error);
    showStatusMessage('Connection test failed: ' + error.message, 'error');
  } finally {
    elements.testConnectionBtn.disabled = false;
    elements.testConnectionBtn.textContent = 'Test Connection';
  }
}

/**
 * Handle analyze current page button
 */
async function handleAnalyzeCurrentPage() {
  if (!elements.analyzeCurrentPageBtn) return;
  
  try {
    elements.analyzeCurrentPageBtn.disabled = true;
    elements.analyzeCurrentPageBtn.textContent = 'Analyzing...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'analyzePage'
      });

      showStatusMessage('Page analysis started', 'success');
    } else {
      showStatusMessage('No active tab found', 'error');
    }

  } catch (error) {
    console.error('FocusLine: Analyze current page failed:', error);
    showStatusMessage('Failed to analyze page: ' + error.message, 'error');
  } finally {
    elements.analyzeCurrentPageBtn.disabled = false;
    elements.analyzeCurrentPageBtn.textContent = 'Analyze Current Page';
  }
}

/**
 * Handle refresh status button
 */
async function handleRefreshStatus() {
  if (!elements.refreshStatusBtn) return;
  
  try {
    elements.refreshStatusBtn.disabled = true;
    elements.refreshStatusBtn.textContent = 'Refreshing...';

    await checkStatus();
    showStatusMessage('Status refreshed', 'success');

  } catch (error) {
    console.error('FocusLine: Refresh status failed:', error);
    showStatusMessage('Failed to refresh status', 'error');
  } finally {
    elements.refreshStatusBtn.disabled = false;
    elements.refreshStatusBtn.textContent = 'Refresh Status';
  }
}

/**
 * Check status of all services
 */
async function checkStatus() {
  try {
    // Check extension status
    if (elements.extensionStatus) {
      updateStatusElement(elements.extensionStatus, 'active', 'Extension Active');
    }

    // Check backend status
    if (elements.backendStatus) {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'testConnection'
        });
        console.log("Result:", result);

        if (result && (result.status === 'ok' || result.success)) {
          updateStatusElement(elements.backendStatus, 'active', 'Backend Connected');
        } else {
          updateStatusElement(elements.backendStatus, 'error', 'Backend Error');
        }
      } catch (error) {
        updateStatusElement(elements.backendStatus, 'error', 'Backend Unavailable');
      }
    }

  } catch (error) {
    console.error('FocusLine: Status check failed:', error);
  }
}

/**
 * Update status element
 */
function updateStatusElement(element, status, text) {
  element.textContent = text;
  element.className = `status-value status-${status}`;
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

/**
 * Show status message (fallback for future use)
 */
function showStatusMessage(message, type = 'info') {
  if (elements.statusMessage) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message status-${type}`;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      elements.statusMessage.textContent = '';
      elements.statusMessage.className = 'status-message';
    }, 3000);
  } else {
    // Fallback to console if status message element doesn't exist
    console.log(`FocusLine: ${type.toUpperCase()} - ${message}`);
  }
}

/**
 * Update statistics
 */
async function updateStatistics() {
  try {
    // For now, use placeholder values
    // Later this will load from storage or backend
    elements.pagesAnalyzed.textContent = '0';
    elements.contentBlocked.textContent = '0';
    elements.tabsBlocked.textContent = '0';

  } catch (error) {
    console.error('FocusLine: Failed to update statistics:', error);
  }
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', initialize);
