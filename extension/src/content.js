/**
 * FocusLine Content Script
 * Main entry point for content analysis and filtering
 */
import ApiService from "./services/apiService.js";
import ContentExtractor from "./services/contentExtractor.js";
import UIService from "./services/uiService.js";

const apiService = new ApiService();
const contentExtractor = new ContentExtractor();
const uiService = new UIService();

// Global state
let isInitialized = false;
let isEnabled = true;
let currentContent = null;

/**
 * Initialize the content script
 */
async function initialize() {
  try {
    console.log('FocusLine: Initializing content script...');
    
    // Initialize UI service
    uiService.init();
    
    // Test backend connection
    await testBackendConnection();
    
    // Load settings
    await loadSettings();
    
    // Start content monitoring
    startContentMonitoring();
    
    isInitialized = true;
    console.log('FocusLine: Content script initialized successfully');
    
  } catch (error) {
    console.error('FocusLine: Failed to initialize content script:', error);
    uiService.showError('init-error', 'Failed to initialize FocusLine: ' + error.message);
  }
}

/**
 * Test connection to backend
 */
async function testBackendConnection() {
  try {
    uiService.showLoading('backend-test', {
      message: 'Testing backend connection...',
      overlay: false
    });
    
    const result = await apiService.testConnection();
    
    uiService.hideLoading('backend-test');
    uiService.showNotification('backend-success', 'Backend connected successfully', 'success');
    
    console.log('FocusLine: Backend connection successful');
    return result;
    
  } catch (error) {
    uiService.hideLoading('backend-test');
    uiService.showError('backend-error', 'Backend connection failed: ' + error.message);
    throw error;
  }
}

/**
 * Load extension settings
 */
async function loadSettings() {
  try {
    // For now, use default settings
    // Later this will load from backend or chrome.storage
    const settings = {
      enabled: true,
      sensitivity: 'moderate',
      showNotifications: true
    };
    
    isEnabled = settings.enabled;
    console.log('FocusLine: Settings loaded');
    
  } catch (error) {
    console.error('FocusLine: Failed to load settings:', error);
    // Use default settings
    isEnabled = true;
  }
}

/**
 * Start content monitoring
 */
function startContentMonitoring() {
  // Monitor for DOM changes
  const observer = new MutationObserver(handleDOMChanges);
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Initial content extraction
  setTimeout(() => {
    extractAndAnalyzeContent();
  }, 1000);
  
  console.log('FocusLine: Content monitoring started');
}

/**
 * Handle DOM changes
 */
function handleDOMChanges(mutations) {
  if (!isEnabled || !isInitialized) return;
  
  // Debounce DOM changes
  clearTimeout(window.flDomChangeTimeout);
  window.flDomChangeTimeout = setTimeout(() => {
    extractAndAnalyzeContent();
  }, 500);
}

/**
 * Extract and analyze page content
 */
async function extractAndAnalyzeContent() {
  if (!isEnabled || !isInitialized) return;
  
  try {
    // Extract content
    const content = contentExtractor.extractPageContent();
    if (!content) return;
    
    // Check if content has changed
    if (currentContent && !contentExtractor.hasContentChanged(currentContent, content)) {
      return;
    }
    
    currentContent = content;
    
    // Show loading indicator
    uiService.showLoading('content-analysis', {
      message: 'Analyzing page content...',
      progress: true
    });
    
    // Analyze text nodes
    await analyzeTextNodes(content.textNodes);
    
    // Analyze links
    await analyzeLinks(content.links);
    
    uiService.hideLoading('content-analysis');
    uiService.showNotification('analysis-complete', 'Content analysis completed', 'success');
    
  } catch (error) {
    uiService.hideLoading('content-analysis');
    uiService.showError('analysis-error', 'Content analysis failed: ' + error.message);
    console.error('FocusLine: Content analysis failed:', error);
  }
}

/**
 * Analyze text nodes for inappropriate content
 */
async function analyzeTextNodes(textNodes) {
  if (!textNodes || textNodes.length === 0) return;
  
  const batchSize = 5;
  const totalNodes = textNodes.length;
  
  for (let i = 0; i < totalNodes; i += batchSize) {
    const batch = textNodes.slice(i, i + batchSize);
    
    // Update progress
    const progress = ((i + batchSize) / totalNodes) * 100;
    uiService.updateProgress('content-analysis', progress, `Analyzing ${i + batchSize}/${totalNodes} text nodes`);
    
    // Analyze batch
    for (const textNode of batch) {
      await analyzeTextNode(textNode);
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Analyze a single text node
 */
async function analyzeTextNode(textNode) {
  try {
    const result = await apiService.analyzeContent(textNode.text);
    
    if (result.success && result.data.analysis.shouldBlock) {
      // Block the text node
      blockTextNode(textNode, result.data.analysis);
    }
    
  } catch (error) {
    console.error('FocusLine: Failed to analyze text node:', error);
  }
}

/**
 * Block a text node
 */
function blockTextNode(textNode, analysis) {
  try {
    const element = textNode.node.parentElement;
    if (!element) return;
    
    uiService.showBlockingOverlay(element, analysis.reasoning || 'Inappropriate content');
    
    console.log('FocusLine: Blocked text node:', textNode.text.substring(0, 50) + '...');
    
  } catch (error) {
    console.error('FocusLine: Failed to block text node:', error);
  }
}

/**
 * Analyze links for inappropriate content
 */
async function analyzeLinks(links) {
  if (!links || links.length === 0) return;
  
  for (const link of links) {
    try {
      const result = await apiService.analyzeUrl(link.url, link.text);
      
      if (result.success && result.data.analysis.shouldBlock) {
        // Block the link
        blockLink(link, result.data.analysis);
      }
      
    } catch (error) {
      console.error('FocusLine: Failed to analyze link:', error);
    }
  }
}

/**
 * Block a link
 */
function blockLink(link, analysis) {
  try {
    const element = link.element;
    if (!element) return;
    
    // Disable the link
    element.style.pointerEvents = 'none';
    element.style.opacity = '0.5';
    element.style.textDecoration = 'line-through';
    
    // Add blocking overlay
    uiService.showBlockingOverlay(element, analysis.reasoning || 'Inappropriate link');
    
    console.log('FocusLine: Blocked link:', link.url);
    
  } catch (error) {
    console.error('FocusLine: Failed to block link:', error);
  }
}

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    switch (message.type) {
      case 'settingsChanged':
        handleSettingsChange(message.settings);
        break;
      case 'analyzePage':
        extractAndAnalyzeContent();
        break;
      case 'testConnection':
        testBackendConnection().then(sendResponse);
        return true; // Keep message channel open for async response
      default:
        console.log('FocusLine: Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('FocusLine: Error handling message:', error);
  }
});

/**
 * Handle settings changes
 */
function handleSettingsChange(settings) {
  isEnabled = settings.enabled || true;
  
  if (isEnabled) {
    console.log('FocusLine: Extension enabled');
  } else {
    console.log('FocusLine: Extension disabled');
    // Clean up any existing blocking overlays
    uiService.cleanup();
  }
}

/**
 * Clean up when page unloads
 */
window.addEventListener('beforeunload', () => {
  uiService.cleanup();
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
