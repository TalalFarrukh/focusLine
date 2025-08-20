/**
 * FocusLine Popup Script
 * Handles popup UI interactions and settings management
 */

// DOM elements
const elements = {
  // Status elements
  extensionStatus: document.getElementById('extensionStatus'),
  backendStatus: document.getElementById('backendStatus'),
  aiStatus: document.getElementById('aiStatus'),

  // Settings elements
  enabledToggle: document.getElementById('enabledToggle'),
  tabBlockingToggle: document.getElementById('tabBlockingToggle'),
  contentFilteringToggle: document.getElementById('contentFilteringToggle'),
  sensitivitySelect: document.getElementById('sensitivitySelect'),

  // Action buttons
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  analyzeCurrentPageBtn: document.getElementById('analyzeCurrentPageBtn'),
  refreshStatusBtn: document.getElementById('refreshStatusBtn'),

  // Statistics elements
  pagesAnalyzed: document.getElementById('pagesAnalyzed'),
  contentBlocked: document.getElementById('contentBlocked'),
  tabsBlocked: document.getElementById('tabsBlocked'),

  // Status message
  statusMessage: document.getElementById('statusMessage')
};

// Current settings
let currentSettings = {
  enabled: true,
  tabBlockingEnabled: true,
  contentFilteringEnabled: true,
  sensitivity: 'moderate'
};

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
    showStatusMessage('Failed to initialize popup', 'error');
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get({
      enabled: true,
      tabBlockingEnabled: true,
      contentFilteringEnabled: true,
      sensitivity: 'moderate'
    });

    currentSettings = result;

    // Update UI
    elements.enabledToggle.checked = currentSettings.enabled;
    elements.tabBlockingToggle.checked = currentSettings.tabBlockingEnabled;
    elements.contentFilteringToggle.checked = currentSettings.contentFilteringEnabled;
    elements.sensitivitySelect.value = currentSettings.sensitivity;

    console.log('FocusLine: Settings loaded');

  } catch (error) {
    console.error('FocusLine: Failed to load settings:', error);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    await chrome.storage.sync.set(currentSettings);

    // Notify background script
    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      settings: currentSettings
    });

    // Notify content scripts
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'settingsChanged',
          settings: currentSettings
        });
      } catch (error) {
        // Tab might not have content script, ignore
      }
    }

    showStatusMessage('Settings saved successfully', 'success');
    console.log('FocusLine: Settings saved');

  } catch (error) {
    console.error('FocusLine: Failed to save settings:', error);
    showStatusMessage('Failed to save settings', 'error');
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
  elements.sensitivitySelect.addEventListener('change', handleSensitivityChange);

  // Action buttons
  elements.testConnectionBtn.addEventListener('click', handleTestConnection);
  elements.analyzeCurrentPageBtn.addEventListener('click', handleAnalyzeCurrentPage);
  elements.refreshStatusBtn.addEventListener('click', handleRefreshStatus);
}

/**
 * Handle enabled toggle
 */
function handleEnabledToggle() {
  currentSettings.enabled = elements.enabledToggle.checked;
  saveSettings();
}

/**
 * Handle tab blocking toggle
 */
function handleTabBlockingToggle() {
  currentSettings.tabBlockingEnabled = elements.tabBlockingToggle.checked;
  saveSettings();
}

/**
 * Handle content filtering toggle
 */
function handleContentFilteringToggle() {
  currentSettings.contentFilteringEnabled = elements.contentFilteringToggle.checked;
  saveSettings();
}

/**
 * Handle sensitivity change
 */
function handleSensitivityChange() {
  currentSettings.sensitivity = elements.sensitivitySelect.value;
  saveSettings();
}

/**
 * Handle test connection button
 */
async function handleTestConnection() {
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
    updateStatusElement(elements.extensionStatus, 'active', 'Extension Active');

    // Check backend status
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'testConnection'
      });
      console.log("Result:", result);

      if (result && (result.status === 'ok' || result.success)) {
        updateStatusElement(elements.backendStatus, 'active', 'Backend Connected');
        updateStatusElement(elements.aiStatus, 'active', 'AI Service Ready');
      } else {
        updateStatusElement(elements.backendStatus, 'error', 'Backend Error');
        updateStatusElement(elements.aiStatus, 'error', 'AI Service Error');
      }
    } catch (error) {
      updateStatusElement(elements.backendStatus, 'error', 'Backend Unavailable');
      updateStatusElement(elements.aiStatus, 'error', 'AI Service Unavailable');
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
 * Show status message
 */
function showStatusMessage(message, type = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.statusMessage.textContent = '';
    elements.statusMessage.className = 'status-message';
  }, 3000);
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
