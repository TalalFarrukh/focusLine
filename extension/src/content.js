/**
 * FocusLine Content Script
 * Main entry point for content analysis and filtering
 */
import ApiService from "./services/apiService.js";
import ContentExtractor from "./services/contentExtractor.js";
import UIService from "./services/uiService.js";
import CacheService from "./services/cacheService.js";

const apiService = new ApiService();
const contentExtractor = new ContentExtractor();
const uiService = new UIService();
const cacheService = new CacheService();

// Global state
let isInitialized = false;
let isEnabled = true;
let currentContentHash = null;
let pausedUntilTs = 0; // epoch ms when analysis can resume
let lastAnalysisTs = 0; // last successful analysis time
let analysisInProgress = false; // prevent concurrent analyses

// Content analysis cache (in-memory for session)
const contentAnalysisCache = new Map(); // hash -> { result, timestamp }

/**
 * Initialize the content script
 */
async function initialize() {
  try {
    console.log('FocusLine: Initializing content script...');
    
    // Initialize services
    uiService.init();
    await cacheService.initialize();
    
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
    // Removed success notification - backend connection is now silent
    
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
  
  // Initial content extraction with delay
  setTimeout(() => {
    extractAndAnalyzeContent();
  }, 2000); // Increased delay for better page load completion
  
  console.log('FocusLine: Content monitoring started');
}

/**
 * Handle DOM changes with improved debouncing
 */
function handleDOMChanges(mutations) {
  if (!isEnabled || !isInitialized || analysisInProgress) return;
  
  // Filter out irrelevant mutations
  const relevantMutations = mutations.filter(mutation => {
    // Ignore attribute changes (style, class, etc.)
    if (mutation.type === 'attributes') return false;
    
    // Ignore changes to script, style, meta, link elements
    if (mutation.target.tagName && 
        ['SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT'].includes(mutation.target.tagName)) {
      return false;
    }
    
    // Ignore changes to hidden elements
    if (mutation.target.style && mutation.target.style.display === 'none') return false;
    
    return true;
  });
  
  if (relevantMutations.length === 0) return;
  
  // Debounce DOM changes with progressive delay
  clearTimeout(window.flDomChangeTimeout);
  const delay = window.flLastChangeTime && 
    (Date.now() - window.flLastChangeTime) < 5000 ? 3000 : 2000; // Progressive delay
  
  window.flDomChangeTimeout = setTimeout(() => {
    window.flLastChangeTime = Date.now();
    extractAndAnalyzeContent();
  }, delay);
}

/**
 * Extract and analyze page content with improved change detection
 */
async function extractAndAnalyzeContent() {
  if (!isEnabled || !isInitialized || analysisInProgress) return;
  
  const now = Date.now();
  if (now < pausedUntilTs) {
    return; // Respect cooldown from backend
  }
  
  // Enforce minimum interval between analyses
  if (now - lastAnalysisTs < 10000) { // Increased to 10 seconds
    return;
  }
  
  try {
    analysisInProgress = true;
    
    // Extract content
    const content = contentExtractor.extractPageContent();
    if (!content || !content.textNodes || content.textNodes.length === 0) {
      analysisInProgress = false;
      return;
    }
    
    // Generate content hash for change detection
    const contentHash = generateContentHash(content);
    
    // Check if content has meaningfully changed
    if (currentContentHash === contentHash) {
      analysisInProgress = false;
      return;
    }
    
    // Check cache for this content hash
    const cachedResult = await cacheService.getContentCache(contentHash);
    if (cachedResult) {
      console.log('FocusLine: Using cached content analysis result');
      applyCachedAnalysis(cachedResult);
      currentContentHash = contentHash;
      analysisInProgress = false;
      return;
    }
    
    // Check in-memory cache
    const memoryCached = contentAnalysisCache.get(contentHash);
    if (memoryCached && (now - memoryCached.timestamp) < 300000) { // 5 minutes
      console.log('FocusLine: Using in-memory cached content analysis result');
      applyCachedAnalysis(memoryCached.result);
      currentContentHash = contentHash;
      analysisInProgress = false;
      return;
    }
    
    currentContentHash = contentHash;
    
    // Content analysis now runs silently in the background - no overlay shown
    
    // Analyze text nodes
    const analysisResult = await analyzeTextNodes(content.textNodes);
    
    if (analysisResult) {
      // Cache the result
      await cacheService.setContentCache(contentHash, analysisResult);
      contentAnalysisCache.set(contentHash, {
        result: analysisResult,
        timestamp: now
      });
      
      lastAnalysisTs = now;
      // Removed completion notification - analysis is now completely silent
    }
    
  } catch (error) {
    uiService.showError('analysis-error', 'Content analysis failed: ' + error.message);
    console.error('FocusLine: Content analysis failed:', error);
  } finally {
    analysisInProgress = false;
  }
}

/**
 * Generate content hash for change detection
 */
function generateContentHash(content) {
  if (!content || !content.textNodes) return '';
  
  // Create a hash from text content and structure
  const textContent = content.textNodes
    .map(node => node.text)
    .join('|')
    .substring(0, 1000); // Limit length for performance
  
  let hash = 0;
  for (let i = 0; i < textContent.length; i++) {
    const char = textContent.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString();
}

/**
 * Apply cached analysis results
 */
function applyCachedAnalysis(cachedResult) {
  if (!cachedResult || !cachedResult.results) return;
  
  // Apply blocking based on cached results
  Object.entries(cachedResult.results).forEach(([nodeId, analysis]) => {
    if (analysis.shouldBlock) {
      const node = document.querySelector(`[data-focusline-id="${nodeId}"]`);
      if (node) {
        blockTextNode(node, analysis.reasoning || 'Inappropriate content detected');
      }
    }
  });
}

/**
 * Analyze text nodes for inappropriate content
 */
async function analyzeTextNodes(textNodes) {
  if (!textNodes || textNodes.length === 0) return null;

  // Prioritize visible, longer text nodes; cap total analyzed per cycle
  const MAX_PER_CYCLE = 15; // Reduced for better performance
  const prioritized = textNodes
    .map(n => ({ 
      n, 
      score: (n.position?.visible ? 3 : 0) + 
            Math.min(n.text.length / 50, 5) + 
            (n.position?.top < window.innerHeight ? 2 : 0) // Prioritize above-fold content
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PER_CYCLE)
    .map(x => x.n);

  // Build batch with deduplication
  const batch = [];
  const seenTexts = new Set();
  
  for (const node of prioritized) {
    const text = node.text.trim();
    if (text.length < 10 || seenTexts.has(text)) continue; // Skip very short or duplicate text
    
    seenTexts.add(text);
    batch.push({
      id: node.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: text.substring(0, 1000) // Limit text length
    });
  }

  if (batch.length === 0) return null;

  try {
    console.log(`FocusLine: Analyzing ${batch.length} text nodes`);
    
    const result = await apiService.analyzeContentBatch(batch);
    
    if (result.success && result.data.results) {
      // Apply blocking based on results
      Object.entries(result.data.results).forEach(([nodeId, analysis]) => {
        if (analysis.shouldBlock) {
          const node = document.querySelector(`[data-focusline-id="${nodeId}"]`);
          if (node) {
            blockTextNode(node, analysis.reasoning || 'Inappropriate content detected');
          }
        }
      });
      
      return result.data;
    }
    
    return null;
  } catch (error) {
    console.error('FocusLine: Error analyzing text nodes:', error);
    
    // Handle rate limiting
    if (error.message && error.message.includes('429')) {
      pausedUntilTs = Date.now() + 60000; // Pause for 1 minute
      uiService.showNotification('rate-limit', 'Analysis paused due to rate limits', 'warning');
    }
    
    throw error;
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

// Link analysis removed - handled by tab blocking in background script

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
