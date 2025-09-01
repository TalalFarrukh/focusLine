/**
 * FocusLine Content Script
 * Main entry point for content analysis and filtering
 */
import ApiService from "./services/apiService.js";
import ContentExtractor from "./services/contentExtractor.js";
import UIService from "./services/uiService.js";
import CacheService from "./services/cacheService.js";
import SettingsService from "./services/settingsService.js";
import WhitelistService from "./services/whitelistService.js";

const apiService = new ApiService();
const contentExtractor = new ContentExtractor();
const uiService = new UIService();
const cacheService = new CacheService();
const settingsService = new SettingsService();

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
    // Initialize services
    uiService.init();
    await cacheService.initialize();
    await settingsService.initialize();
    
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
 * Load extension settings from SettingsService
 */
async function loadSettings() {
  try {
    // Get settings from SettingsService (which syncs with backend and storage)
    const settings = settingsService.getSettings();
    
    isEnabled = settings.enabled;
    console.log('FocusLine: Settings loaded from SettingsService:', settings);
    
  } catch (error) {
    console.error('FocusLine: Failed to load settings:', error);
    // Use default settings on error
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
  
  // Get sensitivity-based initial delay
  const sensitivity = settingsService.getSensitivity();
  const sensitivityConfig = {
    low: { initialDelay: 3000 },
    moderate: { initialDelay: 2000 },
    high: { initialDelay: 1000 }
  };
  const config = sensitivityConfig[sensitivity] || sensitivityConfig.moderate;
  
  // Initial content extraction with sensitivity-based delay
  setTimeout(() => {
    extractAndAnalyzeContent();
  }, config.initialDelay);
  
  console.log('FocusLine: Content monitoring started with sensitivity:', sensitivity);
}

/**
 * Handle DOM changes with improved debouncing
 */
function handleDOMChanges(mutations) {
  // Check if extension and content analysis are enabled via SettingsService
  if (!settingsService.isContentAnalysisEnabled() || !isInitialized || analysisInProgress) return;
  
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
  
  // Get sensitivity-based debouncing
  const sensitivity = settingsService.getSensitivity();
  const sensitivityConfig = {
    low: { baseDelay: 3000, progressiveDelay: 5000 },
    moderate: { baseDelay: 2000, progressiveDelay: 3000 },
    high: { baseDelay: 1000, progressiveDelay: 2000 }
  };
  const config = sensitivityConfig[sensitivity] || sensitivityConfig.moderate;
  
  // Debounce DOM changes with progressive delay based on sensitivity
  clearTimeout(window.flDomChangeTimeout);
  const delay = window.flLastChangeTime && 
    (Date.now() - window.flLastChangeTime) < config.progressiveDelay ? config.baseDelay : config.baseDelay;
  
  window.flDomChangeTimeout = setTimeout(() => {
    window.flLastChangeTime = Date.now();
    extractAndAnalyzeContent();
  }, delay);
}

/**
 * Extract and analyze page content with improved change detection
 */
async function extractAndAnalyzeContent() {
  // Check if extension and content analysis are enabled via SettingsService
  if (!settingsService.isContentAnalysisEnabled() || !isInitialized || analysisInProgress) return;

  // Check if current domain is whitelisted for content analysis
  if (WhitelistService.isUrlContentAnalysisWhitelisted(window.location.href)) {
    console.log('FocusLine: Skipping content analysis for whitelisted domain:', window.location.hostname);
    return;
  }
  
  const now = Date.now();
  if (now < pausedUntilTs) {
    return; // Respect cooldown from backend
  }
  
  // Get sensitivity-based analysis delay
  const sensitivity = settingsService.getSensitivity();
  const sensitivityConfig = {
    low: { analysisDelay: 15000 },
    moderate: { analysisDelay: 10000 },
    high: { analysisDelay: 8000 }
  };
  const config = sensitivityConfig[sensitivity] || sensitivityConfig.moderate;
  
  // Enforce minimum interval between analyses based on sensitivity
  if (now - lastAnalysisTs < config.analysisDelay) {
    return;
  }
  
  try {
    analysisInProgress = true;
    
    // Extract content with enhanced search result detection
    const content = extractPageContentWithSearchResults();
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
      console.log('FocusLine: Content analysis completed');
    }
    
  } catch (error) {
    uiService.showError('analysis-error', 'Content analysis failed: ' + error.message);
    console.error('FocusLine: Content analysis failed:', error);
  } finally {
    analysisInProgress = false;
  }
}

/**
 * Extract page content with enhanced search result detection
 */
function extractPageContentWithSearchResults() {
  try {
    const content = {
      url: window.location.href,
      title: document.title,
      textNodes: [],
      links: [],
      images: [],
      metadata: contentExtractor._extractMetadata()
    };

    // Extract text nodes with enhanced search result detection
    content.textNodes = extractTextNodesWithSearchResults();
    
    // Extract links
    content.links = contentExtractor._extractLinks();
    
    // Extract images
    content.images = contentExtractor._extractImages();

    return content;
  } catch (error) {
    console.error('Content extraction failed:', error);
    return null;
  }
}

/**
 * Extract text nodes with enhanced search result detection
 */
function extractTextNodesWithSearchResults() {
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip if parent is ignored
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        if (contentExtractor.ignoredTags.includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip if parent has ignored class
        if (contentExtractor.ignoredClasses.some(cls => parent.classList.contains(cls))) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip empty or very short text
        const text = node.textContent.trim();
        if (text.length < 3) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text.length > 0) {
      textNodes.push({
        text: text,
        node: node,
        context: contentExtractor._getNodeContext(node),
        position: contentExtractor._getNodePosition(node)
      });
    }
  }

  // Also extract search result titles and URLs specifically
  const searchResultElements = extractSearchResultElements();
  textNodes.push(...searchResultElements);

  return textNodes;
}

/**
 * Extract search result titles and URLs specifically
 */
function extractSearchResultElements() {
  const searchResultNodes = [];
  
  // Find search result containers
  const searchResultContainers = document.querySelectorAll('[class*="g"], [class*="rc"], [class*="result"], [class*="b_algo"], [class*="result__body"]');
  
  searchResultContainers.forEach(container => {
    // Extract titles (often in h3, h2, or a tags)
    const titleElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, a[href]');
    titleElements.forEach(element => {
      const text = element.textContent.trim();
      if (text.length > 0) {
        searchResultNodes.push({
          text: text,
          node: element.firstChild || element,
          context: {
            tagName: element.tagName,
            className: element.className,
            isSearchResult: true,
            elementType: 'title'
          },
          position: contentExtractor._getNodePosition(element.firstChild || element)
        });
      }
    });
    
    // Extract URLs (often in cite, span, or div elements)
    const urlElements = container.querySelectorAll('cite, [class*="url"], [class*="cite"]');
    urlElements.forEach(element => {
      const text = element.textContent.trim();
      if (text.length > 0) {
        searchResultNodes.push({
          text: text,
          node: element.firstChild || element,
          context: {
            tagName: element.tagName,
            className: element.className,
            isSearchResult: true,
            elementType: 'url'
          },
          position: contentExtractor._getNodePosition(element.firstChild || element)
        });
      }
    });
  });
  
  return searchResultNodes;
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
  
  // Apply blocking based on cached results (should already have threshold applied)
  Object.entries(cachedResult.results).forEach(([nodeId, analysis]) => {
    if (analysis.shouldBlock) {
      const element = document.querySelector(`[data-focusline-id="${nodeId}"]`);
      if (element) {
        // Get the original text node for better context
        const textNode = element._focuslineTextNode || { node: element, text: element.textContent };
        blockSearchResultContainer(element, {
          ...analysis,
          userThreshold: analysis.userThreshold || settingsService.getBlockThreshold(),
          aiScore: analysis.score
        });
      }
    }
  });
}

/**
 * Analyze text nodes for inappropriate content
 */
async function analyzeTextNodes(textNodes) {
  if (!textNodes || textNodes.length === 0) return null;

  // Get current settings for threshold and sensitivity
  const blockThreshold = settingsService.getBlockThreshold();
  const sensitivity = settingsService.getSensitivity();
  
  // Adjust analysis parameters based on sensitivity
  const sensitivityConfig = {
    low: { maxPerCycle: 10, minTextLength: 15, analysisDelay: 15000 },
    moderate: { maxPerCycle: 15, minTextLength: 10, analysisDelay: 10000 },
    high: { maxPerCycle: 20, minTextLength: 5, analysisDelay: 8000 }
  };
  
  const config = sensitivityConfig[sensitivity] || sensitivityConfig.moderate;

  // Prioritize visible, longer text nodes; cap total analyzed per cycle
  const MAX_PER_CYCLE = config.maxPerCycle;
  const MIN_TEXT_LENGTH = config.minTextLength;
  
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

  // Build batch with deduplication and DOM ID attachment
  const batch = [];
  const seenTexts = new Set();
  const nodeIdMap = new Map(); // Map batch ID to text node object
  
  for (const node of prioritized) {
    const text = node.text.trim();
    if (text.length < MIN_TEXT_LENGTH || seenTexts.has(text)) continue; // Skip very short or duplicate text
    
    seenTexts.add(text);
    
    // Find the search result container for this text node
    const searchResultContainer = findSearchResultContainer(node.node);
    
    // Generate stable ID
    const nodeId = `fl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Attach ID to the search result container (not just the text node's parent)
    if (searchResultContainer) {
      searchResultContainer.setAttribute('data-focusline-id', nodeId);
      // Store the text node reference and container for later use
      searchResultContainer._focuslineTextNode = node;
      searchResultContainer._focuslineContainer = searchResultContainer;
    } else {
      // Fallback to text node's parent if no search result container found
      const element = node.node.parentElement;
      if (element) {
        element.setAttribute('data-focusline-id', nodeId);
        element._focuslineTextNode = node;
      }
    }
    
    batch.push({
      id: nodeId,
      text: text.substring(0, 1000) // Limit text length
    });
    
    // Store mapping for later use
    nodeIdMap.set(nodeId, node);
  }

  if (batch.length === 0) return null;

  try {
    const result = await apiService.analyzeContentBatch(batch, {
      blockThreshold: blockThreshold,
      sensitivity: sensitivity
    });
    
    if (result.success && result.data.results) {
      console.log('FocusLine: Processing analysis results:', {
        totalResults: Object.keys(result.data.results).length,
        blockThreshold: blockThreshold,
        sensitivity: sensitivity
      });
      
      // Apply blocking based on results (backend already applied user threshold)
      Object.entries(result.data.results).forEach(([nodeId, analysis]) => {
        if (analysis.shouldBlock) {
          // Look for the search result container first, then fallback to element
          let element = document.querySelector(`[data-focusline-id="${nodeId}"]`);
          console.log('FocusLine: Looking for element with ID:', nodeId, 'Found:', !!element);
          
          if (element) {
            // Get the original text node for better context
            const textNode = element._focuslineTextNode || { node: element, text: element.textContent };
            blockSearchResultContainer(element, {
              ...analysis,
              userThreshold: analysis.userThreshold || blockThreshold,
              aiScore: analysis.score
            });
          } else {
            console.warn('FocusLine: Could not find element with ID:', nodeId);
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
    
    // Create enhanced reasoning message
    let reasoning = analysis.reasoning || 'Inappropriate content detected';
    if (analysis.userThreshold && analysis.aiScore) {
      reasoning += ` (AI Score: ${analysis.aiScore}, Threshold: ${analysis.userThreshold})`;
    }
    
    // First, block the main element with overlay
    uiService.showBlockingOverlay(element, reasoning);
    
    // Then, find and block all search result links within this element
    const searchResultLinks = findSearchResultLinks(element);
    searchResultLinks.forEach(link => {
      blockSearchResultLink(link, reasoning);
    });
    
    console.log('FocusLine: Blocked text node:', {
      text: textNode.text.substring(0, 50) + '...',
      aiScore: analysis.aiScore,
      userThreshold: analysis.userThreshold,
      reasoning: analysis.reasoning,
      linksBlocked: searchResultLinks.length
    });
    
  } catch (error) {
    console.error('FocusLine: Failed to block text node:', error);
  }
}

/**
 * Find search result links within an element
 */
function findSearchResultLinks(element) {
  const links = [];
  
  // Find all anchor tags that look like search result links
  const anchors = element.querySelectorAll('a[href]');
  anchors.forEach(anchor => {
    const anchorText = anchor.textContent.trim().toLowerCase();
    const href = anchor.href.toLowerCase();
    
    // Check if this looks like a search result link
    const isSearchResultLink = anchor.closest('[class*="result"], [class*="search"], [class*="item"], [class*="g"], [class*="rc"], [class*="title"]') !== null;
    const hasInappropriateContent = containsInappropriateContent(anchorText) || containsInappropriateContent(href);
    
    if (isSearchResultLink || hasInappropriateContent) {
      links.push(anchor);
    }
  });
  
  // Also find clickable elements that might be search result titles
  const clickableElements = element.querySelectorAll('[onclick], [role="link"], [tabindex], [class*="title"], [class*="heading"]');
  clickableElements.forEach(el => {
    const elementText = el.textContent.trim().toLowerCase();
    if (containsInappropriateContent(elementText)) {
      links.push(el);
    }
  });
  
  return links;
}

/**
 * Check if text contains inappropriate content
 */
function containsInappropriateContent(text) {
  const inappropriatePatterns = [
    'porn', 'sex', 'adult', 'xxx', 'nude', 'naked', 'explicit',
    'pornhub', 'xvideos', 'redtube', 'youporn', 'xnxx',
    'hardcore', 'softcore', 'mature', 'teen', 'milf'
  ];
  
  return inappropriatePatterns.some(pattern => text.includes(pattern));
}

/**
 * Block a search result link specifically
 */
function blockSearchResultLink(linkElement, reason) {
  if (!linkElement) return;
  
  // Store original styles
  linkElement._flOriginalStyles = {
    pointerEvents: linkElement.style.pointerEvents,
    userSelect: linkElement.style.userSelect,
    textDecoration: linkElement.style.textDecoration,
    color: linkElement.style.color,
    cursor: linkElement.style.cursor,
    opacity: linkElement.style.opacity
  };
  
  // Make link completely unclickable and visually indicate it's blocked
  linkElement.style.pointerEvents = 'none';
  linkElement.style.userSelect = 'none';
  linkElement.style.textDecoration = 'line-through';
  linkElement.style.color = '#999';
  linkElement.style.cursor = 'not-allowed';
  linkElement.style.opacity = '0.6';
  
  // Add blocking indicator
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
  
  // Prevent all types of interactions
  const events = [
    'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
    'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'keydown', 'keyup', 'keypress',
    'focus', 'blur', 'focusin', 'focusout'
  ];
  
  events.forEach(eventType => {
    linkElement.addEventListener(eventType, preventInteraction, true);
  });
  
  // Also block all child elements
  const childElements = linkElement.querySelectorAll('*');
  childElements.forEach(child => {
    child.style.pointerEvents = 'none';
    child.style.userSelect = 'none';
  });
  
  // Add visual blocking indicator
  addBlockingIndicator(linkElement);
}

/**
 * Add visual blocking indicator to a link
 */
function addBlockingIndicator(linkElement) {
  // Create blocking indicator
  const indicator = document.createElement('div');
  indicator.className = 'fl-link-block-indicator';
  indicator.innerHTML = '🚫';
  indicator.style.cssText = `
    position: absolute;
    top: -2px;
    right: -2px;
    font-size: 12px;
    background: white;
    border-radius: 50%;
    padding: 1px;
    z-index: 1001;
    pointer-events: none;
  `;
  
  // Make sure the link has relative positioning
  if (getComputedStyle(linkElement).position === 'static') {
    linkElement.style.position = 'relative';
  }
  
  linkElement.appendChild(indicator);
}

/**
 * Find the search result container for a text node
 */
function findSearchResultContainer(textNode) {
  if (!textNode) return null;
  
  let currentElement = textNode.parentElement;
  let depth = 0;
  const maxDepth = 15; // Prevent infinite loops
  
  while (currentElement && depth < maxDepth) {
    // Check if this element is a search result container
    const tagName = currentElement.tagName;
    const className = currentElement.className || '';
    const id = currentElement.id || '';
    
    // Common search result container patterns
    const isSearchResultContainer = 
      // Google search results
      className.includes('g') || 
      className.includes('rc') || 
      className.includes('result') ||
      className.includes('search-result') ||
      // Bing search results
      className.includes('b_algo') ||
      className.includes('b_title') ||
      // DuckDuckGo search results
      className.includes('result__body') ||
      className.includes('result__title') ||
      // Generic search result patterns
      className.includes('serp-item') ||
      className.includes('search-item') ||
      // Check for common search result IDs
      id.includes('result') ||
      id.includes('search') ||
      // Check for common search result attributes
      currentElement.getAttribute('data-testid')?.includes('result') ||
      currentElement.getAttribute('data-testid')?.includes('search');
    
    if (isSearchResultContainer) {
      return currentElement;
    }
    
    // Stop if we reach body or html
    if (tagName === 'BODY' || tagName === 'HTML') {
      break;
    }
    
    currentElement = currentElement.parentElement;
    depth++;
  }
  
  return null;
}

/**
 * Block an entire search result container
 */
function blockSearchResultContainer(container, analysis) {
  try {
    // Create enhanced reasoning message
    let reasoning = analysis.reasoning || 'Inappropriate content detected';
    if (analysis.userThreshold && analysis.aiScore) {
      reasoning += ` (AI Score: ${analysis.aiScore}, Threshold: ${analysis.userThreshold})`;
    }
    
    // Block the entire container with overlay
    uiService.showBlockingOverlay(container, reasoning);
    
    // Find and block all clickable elements within the search result
    const clickableElements = findAllClickableElements(container);
    clickableElements.forEach(element => {
      blockClickableElement(element, reasoning);
    });
    
    console.log('FocusLine: Blocked search result container:', {
      containerTag: container.tagName,
      containerClass: container.className,
      aiScore: analysis.aiScore,
      userThreshold: analysis.userThreshold,
      reasoning: analysis.reasoning,
      clickableElementsBlocked: clickableElements.length
    });
    
  } catch (error) {
    console.error('FocusLine: Failed to block search result container:', error);
  }
}

/**
 * Find all clickable elements within a search result container
 */
function findAllClickableElements(container) {
  const clickableElements = [];
  
  // Find all anchor tags
  const anchors = container.querySelectorAll('a[href]');
  anchors.forEach(anchor => {
    clickableElements.push(anchor);
  });
  
  // Find elements with click handlers
  const clickableElementsWithHandlers = container.querySelectorAll('[onclick], [role="link"], [tabindex]');
  clickableElementsWithHandlers.forEach(element => {
    if (!clickableElements.includes(element)) {
      clickableElements.push(element);
    }
  });
  
  // Find search result titles (often in h3, h2, or div elements)
  const titleElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]');
  titleElements.forEach(element => {
    if (!clickableElements.includes(element)) {
      clickableElements.push(element);
    }
  });
  
  // Find elements that look like they might be clickable
  const potentialClickable = container.querySelectorAll('[class*="link"], [class*="click"], [class*="button"]');
  potentialClickable.forEach(element => {
    if (!clickableElements.includes(element)) {
      clickableElements.push(element);
    }
  });
  
  return clickableElements;
}

/**
 * Block a clickable element
 */
function blockClickableElement(element, reason) {
  if (!element) return;
  
  // Store original styles
  element._flOriginalStyles = {
    pointerEvents: element.style.pointerEvents,
    userSelect: element.style.userSelect,
    textDecoration: element.style.textDecoration,
    color: element.style.color,
    cursor: element.style.cursor,
    opacity: element.style.opacity
  };
  
  // Make element completely unclickable and visually indicate it's blocked
  element.style.pointerEvents = 'none';
  element.style.userSelect = 'none';
  element.style.textDecoration = 'line-through';
  element.style.color = '#999';
  element.style.cursor = 'not-allowed';
  element.style.opacity = '0.6';
  
  // Add blocking indicator
  element.setAttribute('data-fl-element-blocked', 'true');
  element.setAttribute('data-fl-block-reason', reason);
  
  // Add event listeners to prevent any interactions
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
    'focus', 'blur', 'focusin', 'focusout'
  ];
  
  events.forEach(eventType => {
    element.addEventListener(eventType, preventInteraction, true);
  });
  
  // Also block all child elements
  const childElements = element.querySelectorAll('*');
  childElements.forEach(child => {
    child.style.pointerEvents = 'none';
    child.style.userSelect = 'none';
  });
  
  // Add visual blocking indicator
  addBlockingIndicator(element);
}

/**
 * Clear in-memory session cache
 */
function clearInMemoryCache() {
  try {
    // Clear content analysis cache
    contentAnalysisCache.clear();
    
    // Reset analysis state
    currentContentHash = null;
    lastAnalysisTs = 0;
    analysisInProgress = false;
    pausedUntilTs = 0;
    
    // Unblock all blocked links
    unblockAllSearchResultLinks();
  } catch (error) {
    console.error('FocusLine: Error clearing in-memory cache:', error);
  }
}

/**
 * Unblock all search result links
 */
function unblockAllSearchResultLinks() {
  const blockedLinks = document.querySelectorAll('[data-fl-link-blocked="true"]');
  blockedLinks.forEach(link => {
    unblockSearchResultLink(link);
  });
  
  // Also unblock all blocked elements
  const blockedElements = document.querySelectorAll('[data-fl-element-blocked="true"]');
  blockedElements.forEach(element => {
    unblockClickableElement(element);
  });
}

/**
 * Unblock a specific search result link
 */
function unblockSearchResultLink(linkElement) {
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
  
  // Remove event listeners
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
  
  // Restore interactions on child elements
  const childElements = linkElement.querySelectorAll('*');
  childElements.forEach(child => {
    child.style.pointerEvents = '';
    child.style.userSelect = '';
  });
  
  // Remove blocking indicator
  const indicator = linkElement.querySelector('.fl-link-block-indicator');
  if (indicator) {
    indicator.remove();
  }
  
  // Remove blocking attributes
  linkElement.removeAttribute('data-fl-link-blocked');
  linkElement.removeAttribute('data-fl-block-reason');
}

/**
 * Unblock a clickable element
 */
function unblockClickableElement(element) {
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
  
  // Remove event listeners
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
  
  // Restore interactions on child elements
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

/**
 * Handle storage changes
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  (async () => {
    try {
      // Check if settings changed
      if (namespace === 'sync' && changes.settings) {
        console.log('FocusLine: Settings changed in storage, refreshing...');
        await settingsService.refreshSettings();
        await loadSettings();
      }
    } catch (error) {
      console.error('FocusLine: Error handling storage change:', error);
    }
  })();
});

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'settingsChanged':
          await handleSettingsChange(message.settings);
          break;
        case 'analyzePage':
          extractAndAnalyzeContent();
          break;
        case 'testConnection':
          const result = await testBackendConnection();
          sendResponse(result);
          break;
        case 'clearCache':
          clearInMemoryCache();
          break;
        default:
          console.log('FocusLine: Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('FocusLine: Error handling message:', error);
    }
  })();
  
  return true; // Keep message channel open for async response
});

/**
 * Handle settings changes
 */
async function handleSettingsChange(settings) {
  try {
    // Refresh settings from SettingsService to ensure consistency
    await settingsService.refreshSettings();
    
    // Update local settings state
    isEnabled = settings.enabled ?? true;
    
    if (isEnabled) {
      console.log('FocusLine: Extension enabled');
    } else {
      console.log('FocusLine: Extension disabled');
      // Clean up any existing blocking overlays
      uiService.cleanup();
      // Unblock all search result links
      unblockAllSearchResultLinks();
    }
    
    // Reload settings from SettingsService to ensure consistency
    await loadSettings();
    
  } catch (error) {
    console.error('FocusLine: Error handling settings change:', error);
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
