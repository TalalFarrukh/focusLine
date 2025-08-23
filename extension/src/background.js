/**
 * FocusLine Background Script
 * Handles tab blocking and navigation management
 */
import ApiService from "./services/apiService.js";
import SettingsService from "./services/settingsService.js";
import CacheService from "./services/cacheService.js";

const apiService = new ApiService();
const settingsService = new SettingsService();
const cacheService = new CacheService();

// Global state
let blockedTabs = new Set();

// URL analysis deduplication per tab (prevent multiple calls for same URL)
const tabUrlAnalysis = new Map(); // tabId -> { url, timestamp, promise }

/**
 * Initialize background script
 */
async function initialize() {
  try {
    console.log('FocusLine: Initializing background script...');

    // Initialize services
    await settingsService.initialize();
    await cacheService.initialize();

    // Set up event listeners
    setupEventListeners();

    // Clear expired cache entries periodically
    setInterval(() => {
      cacheService.clearExpiredCache();
    }, 60 * 60 * 1000); // Every hour

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
 * Check if URL analysis is already in progress for this tab
 */
function isUrlAnalysisInProgress(tabId, url) {
  const analysis = tabUrlAnalysis.get(tabId);
  if (!analysis) return false;

  // Check if it's the same URL and within 30 seconds
  const now = Date.now();
  const timeDiff = now - analysis.timestamp;
  
  if (analysis.url === url && timeDiff < 30000) { // 30 seconds TTL
    return true;
  }

  // Clean up old entries
  if (timeDiff >= 30000) {
    tabUrlAnalysis.delete(tabId);
  }

  return false;
}

/**
 * Mark URL analysis as in progress for this tab
 */
function markUrlAnalysisInProgress(tabId, url, promise) {
  tabUrlAnalysis.set(tabId, {
    url,
    timestamp: Date.now(),
    promise
  });
}

/**
 * Handle navigation attempts
 */
function handleNavigation(details) {
  (async () => {
    if (!settingsService.isTabBlockingEnabled()) return;

    // Only process main frame navigation
    if (details.frameId !== 0) return;

    try {
      const url = details.url;
      console.log('FocusLine: Checking navigation to:', url);

      // Check if analysis is already in progress for this tab
      if (isUrlAnalysisInProgress(details.tabId, url)) {
        console.log('FocusLine: URL analysis already in progress for tab:', details.tabId);
        return;
      }

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
    if (!settingsService.isTabBlockingEnabled() || !changeInfo.url) return;

    try {
      const url = changeInfo.url;
      console.log('FocusLine: Tab URL updated:', url);

      // Check if analysis is already in progress for this tab
      if (isUrlAnalysisInProgress(tabId, url)) {
        console.log('FocusLine: URL analysis already in progress for tab:', tabId);
        return;
      }

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
    if (!settingsService.isTabBlockingEnabled() || !tab.url) return;

    try {
      const url = tab.url;
      console.log('FocusLine: New tab created:', url);

      // Check if analysis is already in progress for this tab
      if (isUrlAnalysisInProgress(tab.id, url)) {
        console.log('FocusLine: URL analysis already in progress for tab:', tab.id);
        return;
      }

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

    // Check if analysis is already in progress
    if (isUrlAnalysisInProgress(tabId, url)) {
      console.log('FocusLine: URL analysis already in progress for tab:', tabId);
      return;
    }

    // Check client-side cache first
    const cachedResult = await cacheService.getUrlCache(url);
    if (cachedResult) {
      console.log('FocusLine: Using cached URL analysis result');
      if (cachedResult.shouldBlock) {
        await blockTab(tabId, cachedResult.reasoning || 'Inappropriate content detected (cached)');
      } else {
        await hideTabLoading(tabId);
        console.log('FocusLine: Cached analysis allows URL:', url);
      }
      return;
    }

    // Show loading state in tab
    await showTabLoading(tabId);

    // Create analysis promise and mark as in progress
    const analysisPromise = apiService.analyzeUrl(url);
    markUrlAnalysisInProgress(tabId, url, analysisPromise);

    // Analyze URL with AI
    const result = await analysisPromise;

    if (result.success) {
      // Cache the result
      await cacheService.setUrlCache(url, result.data.analysis);

      if (result.data.analysis.shouldBlock) {
        await blockTab(tabId, result.data.analysis.reasoning || 'Inappropriate content detected');
      } else {
        // Allow the tab
        await hideTabLoading(tabId);
        console.log('FocusLine: AI analysis allows URL:', url);
      }
    } else {
      throw new Error('AI analysis failed');
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
    if (!settingsService.areNotificationsEnabled()) return;

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
          const settings = settingsService.getSettings();
          sendResponse({ success: true, data: settings });
          break;

        case 'updateSettings':
          await settingsService.updateSettings(message.settings);
          sendResponse({ success: true });
          break;

        case 'resetSettings':
          await settingsService.resetSettings();
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
