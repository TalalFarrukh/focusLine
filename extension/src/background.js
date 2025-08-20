/**
 * FocusLine Background Script
 * Handles tab blocking and navigation management
 */
import ApiService from "./services/apiService.js";

const apiService = new ApiService();

// Global state
let isEnabled = true;
let blockedTabs = new Set();

/**
 * Initialize background script
 */
async function initialize() {
  try {
    console.log('FocusLine: Initializing background script...');

    // Load settings
    await loadSettings();

    // Set up event listeners
    setupEventListeners();

    console.log('FocusLine: Background script initialized successfully');

  } catch (error) {
    console.error('FocusLine: Failed to initialize background script:', error);
  }
}

/**
 * Load settings
 */
async function loadSettings() {
  try {
    // For now, use default settings
    // Later this will load from chrome.storage
    const settings = {
      enabled: true,
      tabBlockingEnabled: true,
      sensitivity: 'moderate'
    };

    isEnabled = settings.enabled;
    console.log('FocusLine: Settings loaded');

  } catch (error) {
    console.error('FocusLine: Failed to load settings:', error);
    isEnabled = true;
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Listen for navigation attempts
  chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation);

  // Listen for tab updates
  chrome.tabs.onUpdated.addListener(handleTabUpdate);

  // Listen for new tabs
  chrome.tabs.onCreated.addListener(handleTabCreated);

  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener(handleMessage);

  console.log('FocusLine: Event listeners set up');
}

/**
 * Handle navigation attempts
 */
function handleNavigation(details) {
  (async () => {
    if (!isEnabled) return;

    // Only process main frame navigation
    if (details.frameId !== 0) return;

    try {
      const url = details.url;
      console.log('FocusLine: Checking navigation to:', url);

      // Step 1: Check for explicit URL words
      if (containsExplicitWords(url)) {
        console.log('FocusLine: Blocking explicit URL:', url);
        await blockTab(details.tabId, 'Explicit content detected in URL');
        return;
      }

      // Step 2: Check for ambiguous URL words
      if (containsAmbiguousWords(url)) {
        console.log('FocusLine: Analyzing ambiguous URL:', url);
        await analyzeAndBlockTab(details.tabId, url);
        return;
      }

      // Step 3: Allow clean URLs
      console.log('FocusLine: Allowing clean URL:', url);

    } catch (error) {
      console.error('FocusLine: Error handling navigation:', error);
    }
  })();

  return true;
}

/**
 * Handle tab updates
 */
function handleTabUpdate(tabId, changeInfo, tab) {
  (async () => {
    if (!isEnabled || !changeInfo.url) return;

    try {
      const url = changeInfo.url;
      console.log('FocusLine: Tab URL updated:', url);

      // Check if tab should be blocked
      if (containsExplicitWords(url)) {
        await blockTab(tabId, 'Explicit content detected in URL');
      } else if (containsAmbiguousWords(url)) {
        await analyzeAndBlockTab(tabId, url);
      }

    } catch (error) {
      console.error('FocusLine: Error handling tab update:', error);
    }
  })();

  return true;
}

/**
 * Handle new tab creation
 */
function handleTabCreated(tab) {
  (async () => {
    if (!isEnabled || !tab.url) return;

    try {
      const url = tab.url;
      console.log('FocusLine: New tab created:', url);

      // Check if tab should be blocked
      if (containsExplicitWords(url)) {
        await blockTab(tab.id, 'Explicit content detected in URL');
      } else if (containsAmbiguousWords(url)) {
        await analyzeAndBlockTab(tab.id, url);
      }

    } catch (error) {
      console.error('FocusLine: Error handling new tab:', error);
    }
  })();

  return true;
}

/**
 * Check if URL contains explicit words
 */
function containsExplicitWords(url) {
  const explicitWords = [
    'pornhub.com', 'xhamster.com', 'xnxx.com', 'xvideos.com', 'youporn.com',
    'porn', 'xxx', 'nsfw', 'adult', 'sex'
  ];

  const lowerUrl = url.toLowerCase();
  return explicitWords.some(word => lowerUrl.includes(word));
}

/**
 * Check if URL contains ambiguous words
 */
function containsAmbiguousWords(url) {
  const ambiguousWords = [
    'anal', 'sex', 'nude', 'naked', 'erotic', 'fetish', 'bdsm',
    'milf', 'dilf', 'escort', 'prostitute', 'hooker', 'brothel'
  ];

  const lowerUrl = url.toLowerCase();
  return ambiguousWords.some(word => lowerUrl.includes(word));
}

/**
 * Analyze URL and block tab if necessary
 */
async function analyzeAndBlockTab(tabId, url) {
  try {
    console.log('FocusLine: Analyzing URL with AI:', url);

    // Show loading state in tab
    await showTabLoading(tabId);

    // Analyze URL with AI
    const result = await apiService.analyzeUrl(url);

    if (result.success && result.data.analysis.shouldBlock) {
      await blockTab(tabId, result.data.analysis.reasoning || 'Inappropriate content detected');
    } else {
      // Allow the tab
      await hideTabLoading(tabId);
      console.log('FocusLine: AI analysis allows URL:', url);
    }

  } catch (error) {
    console.error('FocusLine: Error analyzing URL:', error);
    // On error, block conservatively
    await blockTab(tabId, 'Error analyzing content - blocked for safety');
  }
}

/**
 * Block a tab
 */
async function blockTab(tabId, reason) {
  try {
    console.log('FocusLine: Blocking tab', tabId, 'Reason:', reason);

    // Close the tab
    await chrome.tabs.remove(tabId);

    // Add to blocked tabs set
    blockedTabs.add(tabId);

    // Show notification
    await showBlockedNotification(reason);

  } catch (error) {
    console.error('FocusLine: Error blocking tab:', error);
  }
}

/**
 * Show loading state in tab
 */
async function showTabLoading(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'showLoading',
      data: {
        message: 'Analyzing content...',
        overlay: true
      }
    });
  } catch (error) {
    // Tab might not be ready yet, ignore error
  }
}

/**
 * Hide loading state in tab
 */
async function hideTabLoading(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'hideLoading',
      data: { id: 'content-analysis' }
    });
  } catch (error) {
    // Tab might not be ready yet, ignore error
  }
}

/**
 * Show blocked notification
 */
async function showBlockedNotification(reason) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'FocusLine - Content Blocked',
      message: `Page blocked: ${reason}`
    });
  } catch (error) {
    console.error('FocusLine: Error showing notification:', error);
  }
}

/**
 * Handle messages from content scripts
 */
function handleMessage(message, sender, sendResponse) {
  (async () => {
    try {
      switch (message.type) {
        case 'testConnection':
          const result = await apiService.testConnection();
          sendResponse(result);
          break;

        case 'getSettings':
          const settings = await loadSettings();
          sendResponse(settings);
          break;

        case 'updateSettings':
          // Handle settings update
          console.log('FocusLine: Settings updated:', message.settings);
          sendResponse({ success: true });
          break;

        default:
          console.log('FocusLine: Unknown message type:', message.type);
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('FocusLine: Error handling message:', error);
      sendResponse({ error: error.message });
    }
  })();

  return true;
}

/**
 * Clean up when extension is unloaded
 */
chrome.runtime.onSuspend.addListener(() => {
  console.log('FocusLine: Background script unloading');
  blockedTabs.clear();
});

// Initialize when background script loads
initialize();
