(() => {
  const BLUR_CLASS = "fl-blur";
  const ATTRIBUTE_MARK = "data-fl-blurred";
  
  // Timestamped logging helper
  function logWithTimestamp(level, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] FocusLine:`;
    
    switch (level) {
      case 'log':
        console.log(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'error':
        console.error(prefix, ...args);
        break;
      default:
        console.log(prefix, ...args);
    }
  }
  
  // Check if Chrome extension context is still valid
  function isExtensionContextValid() {
    try {
      // Try to access chrome.runtime to check if context is valid
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             chrome.runtime.id;
    } catch (error) {
      return false;
    }
  }
  
  // Hardcoded adult content filter list
  const BLOCKED_WORDS = [
    'xvideo', 'fap', 'tubsexer', 'youporn', 'lesbian', 'porno', 'xhaccess', 'xhopen', 'xhamster', 'xnxx', 'xvideos', 'pornhub', 'porn', 'pornography', 'xxx', 'nsfw', 'nude', 'nudes', 'naked', 'sex', 'sexual', 'sexy', 'erotic', 'fetish', 'kinky', 'bdsm', 'milf', 'dilf', 'escort', 'prostitute', 'hooker', 'brothel', 'stripper', 'webcam', 'camgirl', 'onlyfans', 'leaked', 'uncensored', 'hardcore', 'softcore', 'explicit', 'mature', 'xrated', 'r-rated', 'adults only', 'eighteenplus', '18+', '21+', 'hookup', 'swingers', 'threesome', 'foursome', 'orgy', 'gangbang', 'bukkake', 'creampie', 'cumshot', 'facial', 'blowjob', 'handjob', 'footjob', 'titjob', 'rimjob', 'anal', 'vaginal', 'oral', 'penetration', 'intercourse', 'masturbation', 'orgasm', 'climax', 'ejaculation', 'arousal', 'horny', 'throbbing', 'pulsing', 'moaning', 'slutty', 'whore', 'cock', 'dick', 'penis', 'balls', 'testicles', 'pussy', 'vagina', 'clit', 'clitoris', 'labia', 'vulva', 'breasts', 'boobs', 'tits', 'nipples', 'butthole', 'anus', 'rectum', 'lingerie', 'panties', 'bra', 'thong', 'g-string', 'revealing', 'skimpy', 'low-cut', 'cleavage', 'upskirt', 'downblouse', 'voyeur', 'exhibitionist', 'flasher', 'streaker', 'striptease', 'lap dance', 'pole dance', 'twerk', 'grind', 'hump', 'thrust', 'seduce', 'fondle', 'grope', 'spank', 'whip', 'bind', 'restrain', 'dominate', 'submit', 'master', 'mistress', 'dom', 'sub', 'kink', 'taboo', 'lust', 'fantasy', 'roleplay', 'undress', 'strip', 'expose'
  ];
  
  let cachedRegex = null;
  let processingTimeout = null;

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function clearExistingBlurs(root = document.body) {
    const spans = root.querySelectorAll(`span.${BLUR_CLASS}[${ATTRIBUTE_MARK}]`);
    for (const span of spans) {
      const parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  }

  function buildWordRegex() {
    if (BLOCKED_WORDS.length === 0) return null;
    
    // Create whitelist of common legitimate words that contain blocked substrings
    const legitimateWords = [
      // Analytics family
      'analytics', 'analysis', 'analyst', 'analyze', 'analyzing', 'analytical',
      // Subscribe family  
      'subscribe', 'subscription', 'subscriber', 'subscribed', 'subscribing',
      // Domain family
      'domain', 'domains', 'subdomain', 'subdomains',
      // Personal family
      'personal', 'personality', 'personalize', 'personalized', 'personally',
      // Arsenal family
      'arsenal', 'arsenals',
      // Sexual in educational/professional context
      'sexual-harassment', 'sexual-education', 'sexual-health', 'sexuality',
      // Other common false positives
      'analysis', 'business', 'class', 'classic', 'assessment', 'assist', 'assistance',
      'massage', 'message', 'passage', 'passenger', 'glasses', 'classes',
      'expression', 'impression', 'depression', 'session', 'profession', 'professional',
      'submission', 'admission', 'permission', 'commission', 'transmission',
      'discussion', 'possession', 'obsession', 'succession', 'recession',
      // Technical terms
      'mastermind', 'master-class', 'masterpiece', 'masters', 'mastery',
      'submit', 'submitting', 'submitted', 'submission', 'submissions'
    ];
    
    // Use substring matching to catch compound words like "PornhubComments"
    const sanitized = BLOCKED_WORDS
      .filter(Boolean)
      .map(w => escapeRegex(w.trim()))
      .filter(Boolean);
    
    // Create pattern that matches substrings within words (not just exact words)
    const pattern = `(${sanitized.join("|")})`;
    const regex = new RegExp(pattern, "gi");
    
    // Create a smart regex wrapper
    const smartRegex = {
      test: (text) => {
        if (!text) return false;
        
        // First check if it's a legitimate word
        const textLower = text.toLowerCase();
        for (const legitimate of legitimateWords) {
          if (textLower.includes(legitimate)) {
            return false; // Don't match legitimate words
          }
        }
        
        // Then check for blocked words (substring matches)
        return regex.test(text);
      },
      exec: (text) => {
        if (!text) return null;
        
        // First check if it's a legitimate word
        const textLower = text.toLowerCase();
        for (const legitimate of legitimateWords) {
          if (textLower.includes(legitimate)) {
            return null; // Don't match legitimate words
          }
        }
        
        // Then check for blocked words (substring matches)
        return regex.exec(text);
      },
      get lastIndex() {
        return regex.lastIndex;
      },
      set lastIndex(value) {
        regex.lastIndex = value;
      }
    };
    
    return smartRegex;
  }

  function initializeRegex() {
    cachedRegex = buildWordRegex();
  }

  function wrapMatchInSpan(textNode, start, length) {
    if (!textNode || !textNode.nodeValue) return;
    
    const text = textNode.nodeValue;
    if (start < 0 || start + length > text.length) return;
    
    const before = text.substring(0, start);
    const match = text.substring(start, start + length);
    const after = text.substring(start + length);
    
    const parent = textNode.parentNode;
    if (!parent) return;
    
    // Create new text nodes and span
    const beforeNode = document.createTextNode(before);
    const span = document.createElement('span');
    span.className = BLUR_CLASS;
    span.setAttribute(ATTRIBUTE_MARK, 'true');
    span.textContent = match;
    const afterNode = document.createTextNode(after);
    
    // Replace the original text node
    parent.replaceChild(afterNode, textNode);
    parent.insertBefore(span, afterNode);
    parent.insertBefore(beforeNode, span);
  }

  async function processTextNode(textNode, regex) {
    if (!textNode || !textNode.nodeValue) return;
    
    const text = textNode.nodeValue.trim();
    if (!text || text.length < 2) return;
    
    // Skip if already processed
    if (textNode.parentElement && textNode.parentElement.closest(`[${ATTRIBUTE_MARK}]`)) return;
    
    // Skip script, style, and other non-content elements
    const parent = textNode.parentElement;
    if (!parent) return;
    const tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
    if (parent.closest("script, style, noscript")) return;

    // Try AI-powered detection first for better accuracy
    try {
      const isInappropriate = await isContentInappropriate(text);
      if (isInappropriate) {
        // Blur the entire text node
        wrapMatchInSpan(textNode, 0, text.length);
        return;
      }
    } catch (error) {
      // Fall through to regex-based filtering if AI fails
    }

    // Fallback to regex-based filtering
    if (!regex) return;
    
    let match;
    const matches = [];
    regex.lastIndex = 0;
    let matchCount = 0;
    while ((match = regex.exec(text)) !== null && matchCount < 50) {
      const matchText = match[0];
      if (!matchText) continue;
      matches.push([match.index, matchText.length]);
      matchCount++;
    }
    
    // Process matches in reverse order to maintain indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const [start, len] = matches[i];
      try {
        wrapMatchInSpan(textNode, start, len);
      } catch (e) {
        continue;
      }
    }
  }

  function processSubtree(root, regex) {
    if (!regex) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`[${ATTRIBUTE_MARK}]`)) return NodeFilter.FILTER_REJECT;
        // Only exclude actual script/style content, but allow input values and other text
        if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let textNode;
    while ((textNode = walker.nextNode())) {
      try { processTextNode(textNode, regex); } catch (_) { /* ignore */ }
    }
  }

  function loadWordsAndProcess(root = document.body) {
    if (!cachedRegex) {
      initializeRegex();
    }
    
    // Use cached blur setting - no storage call needed
    if (!isBlurEnabled()) return; // Don't process if blurring is disabled
    
    // Process just the main document areas efficiently
    processSubtree(document.documentElement, cachedRegex);
    
    // Process input values and other special elements (less frequently)
    processInputElements();
  }
  
  function processInputElements() {
    if (!cachedRegex) return;
    
    // Process only the most common input types for performance
    const inputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');
    for (const input of inputs) {
      // Handle input values
      if (input.value && cachedRegex.test(input.value)) {
        input.style.filter = 'blur(15px) !important';
        input.style.backgroundColor = 'rgba(0, 0, 0, 0.3) !important';
        input.style.color = 'transparent !important';
      }
      
      // Handle placeholder text
      if (input.placeholder && cachedRegex.test(input.placeholder)) {
        input.setAttribute('placeholder', input.placeholder.replace(cachedRegex, '████████'));
      }
    }
  }

  // Smart processing function that adapts to different scenarios
  function debouncedProcess(mutations) {
    if (processingTimeout) {
      clearTimeout(processingTimeout);
    }
    
    // Detect if this is likely a navigation event (large DOM changes after a pause)
    const isLikelyNavigation = mutations.length > 10 || 
                              mutations.some(m => m.addedNodes.length > 5);
    
    // Adaptive debouncing: faster for navigation, slower for continuous activity
    const delay = isLikelyNavigation ? 50 : 300;
    const maxNodes = isLikelyNavigation ? 1000 : 500;
    const maxMutations = isLikelyNavigation ? 50 : 20;
    
    // Limit processing to prevent overload
    let totalNodes = 0;
    let processedMutations = 0;
    
    processingTimeout = setTimeout(() => {
      if (!isBlurEnabled()) return;
      
      // Process mutations in batches
      const processBatch = (startIndex) => {
        const batchSize = 5;
        const endIndex = Math.min(startIndex + batchSize, mutations.length);
        
        for (let i = startIndex; i < endIndex && processedMutations < maxMutations; i++) {
          const mutation = mutations[i];
          processedMutations++;
          
          // Process added nodes
          for (const node of mutation.addedNodes) {
            if (totalNodes >= maxNodes) break;
            
            if (node.nodeType === Node.TEXT_NODE) {
              try {
                processTextNode(node, cachedRegex);
                totalNodes++;
              } catch (e) {
                // Ignore errors
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              try {
                processSubtree(node, cachedRegex);
                totalNodes++;
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }
        
        // Continue with next batch if needed
        if (endIndex < mutations.length && processedMutations < maxMutations && totalNodes < maxNodes) {
          setTimeout(() => processBatch(endIndex), 10);
        }
      };
      
      processBatch(0);
    }, delay);
  }

  // Cache settings to avoid repeated storage calls
  let blurEnabled = true;
  let settingsLoaded = false;
  
  // AI filtering cache to avoid repeated API calls
  const aiCache = new Map();
  const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
  
  // Rate limiting for API calls
  const rateLimit = {
    lastCall: 0,
    callCount: 0,
    resetTime: Date.now(),
    maxCallsPerMinute: 60, // Conservative limit
    minInterval: 1000, // Minimum 1 second between calls
    cooldownPeriod: 5 * 60 * 1000 // 5 minutes cooldown after rate limit
  };
  
  // Batch processing system
  const batchQueue = {
    pending: new Map(), // text -> { resolve, reject, timestamp }
    processing: false,
    batchSize: 10, // Process up to 10 texts per API call
    batchTimeout: 2000, // Wait up to 2 seconds to collect texts
    batchTimer: null
  };
  
  // MutationObserver for content processing
  const observer = new MutationObserver(debouncedProcess);
  
  // Google Perspective API key (you'll need to get this from Google Cloud Console)
  const PERSPECTIVE_API_KEY = 'AIzaSyANOCtsdwXj0kqKyG4AJQKgOmWU58XOHes'; // Replace with actual API key

  // Monitor URL changes for SPA navigation
  let lastKnownUrl = window.location.href;
  
  function checkForUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastKnownUrl) {
      lastKnownUrl = currentUrl;
      // URL changed - trigger multiple processing attempts for SPA navigation
      
      // Immediate processing for already-loaded content
      if (isBlurEnabled()) {
        loadWordsAndProcess();
      }
      
      // Follow-up processing for delayed content (GitHub, etc.)
      setTimeout(() => {
        if (isBlurEnabled()) {
          loadWordsAndProcess();
        }
      }, 200);
      
      // Final processing for very slow loading content
      setTimeout(() => {
        if (isBlurEnabled()) {
          loadWordsAndProcess();
        }
      }, 1000);
    }
  }
  
  // Check for URL changes periodically (for SPA navigation)
  setInterval(checkForUrlChange, 500);

  function loadBlurSettings(callback) {
    if (settingsLoaded && !callback) return;
    
    try {
      chrome.storage.sync.get({ 
        blurEnabled: true
      }, (items) => {
        try {
          blurEnabled = items.blurEnabled;
          settingsLoaded = true;
          if (callback) callback();
        } catch (error) {
          logWithTimestamp('error', 'Error processing storage results:', error);
          // Fallback to default settings
          blurEnabled = true;
          settingsLoaded = true;
          if (callback) callback();
        }
      });
    } catch (error) {
      logWithTimestamp('error', 'Extension context invalidated, using default settings:', error);
      // Extension context is invalid, use default settings
      blurEnabled = true;
      settingsLoaded = true;
      if (callback) callback();
    }
  }

  // Rate limiting function
  function canMakeAPICall() {
    const now = Date.now();
    
    // Reset counter if a minute has passed
    if (now - rateLimit.resetTime > 60 * 1000) {
      rateLimit.callCount = 0;
      rateLimit.resetTime = now;
    }
    
    // Check if we're in cooldown period
    if (now - rateLimit.lastCall < rateLimit.cooldownPeriod) {
      return false;
    }
    
    // Check if we've exceeded the rate limit
    if (rateLimit.callCount >= rateLimit.maxCallsPerMinute) {
      return false;
    }
    
    // Check minimum interval between calls
    if (now - rateLimit.lastCall < rateLimit.minInterval) {
      return false;
    }
    
    return true;
  }

  // Batch processing function
  async function processBatch() {
    if (batchQueue.processing || batchQueue.pending.size === 0) return;
    
    batchQueue.processing = true;
    
    try {
      // Get texts to process (up to batchSize)
      const textsToProcess = Array.from(batchQueue.pending.keys()).slice(0, batchQueue.batchSize);
      const promises = textsToProcess.map(text => batchQueue.pending.get(text));
      
      // Remove from pending queue
      textsToProcess.forEach(text => batchQueue.pending.delete(text));
      
      // Check rate limiting
      if (!canMakeAPICall()) {
        logWithTimestamp('log', `Rate limit reached, processing ${textsToProcess.length} texts with fallback filtering`);
        // Resolve all with fallback results
        promises.forEach(({ resolve }) => {
          resolve(cachedRegex ? cachedRegex.test(textsToProcess[0]) : false);
        });
        return;
      }
      
      // Update rate limiting
      rateLimit.lastCall = Date.now();
      rateLimit.callCount++;
      
      logWithTimestamp('log', `Processing batch of ${textsToProcess.length} texts`);
      
      // Make batch API call
      const response = await fetch(`https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedAttributes: {
            SEXUALLY_EXPLICIT: {},
            PROFANITY: {},
            TOXICITY: {}
          },
          comment: { text: textsToProcess.join('\n\n---SEPARATOR---\n\n') },
          languages: ['en']
        })
      });
      
      if (response.status === 429) {
        // Rate limit hit - enter cooldown period
        logWithTimestamp('warn', 'API rate limit hit, entering cooldown period');
        rateLimit.lastCall = Date.now(); // Extend cooldown
        throw new Error('Rate limit exceeded');
      }
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      const sexualScore = data.attributeScores?.SEXUALLY_EXPLICIT?.summaryScore?.value || 0;
      const profanityScore = data.attributeScores?.PROFANITY?.summaryScore?.value || 0;
      const toxicityScore = data.attributeScores?.TOXICITY?.summaryScore?.value || 0;
      
      // Content is inappropriate if any score is above threshold
      const isInappropriate = sexualScore > 0.7 || profanityScore > 0.8 || toxicityScore > 0.9;
      
      // Cache results for all texts in batch
      textsToProcess.forEach(text => {
        const cacheKey = text.toLowerCase().trim();
        aiCache.set(cacheKey, {
          result: isInappropriate,
          timestamp: Date.now()
        });
      });
      
      // Resolve all promises with the same result (batch processing limitation)
      promises.forEach(({ resolve }) => {
        resolve(isInappropriate);
      });
      
      // Clean old cache entries occasionally
      if (aiCache.size > 1000) {
        cleanCache();
      }
      
    } catch (error) {
      logWithTimestamp('warn', 'Batch AI filtering failed:', error.message);
      
      // If it's a rate limit error, extend the cooldown
      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        rateLimit.lastCall = Date.now();
      }
      
      // Resolve all with fallback results
      const textsToProcess = Array.from(batchQueue.pending.keys()).slice(0, batchQueue.batchSize);
      const promises = textsToProcess.map(text => batchQueue.pending.get(text));
      textsToProcess.forEach(text => batchQueue.pending.delete(text));
      
      promises.forEach(({ resolve }) => {
        resolve(cachedRegex ? cachedRegex.test(textsToProcess[0]) : false);
      });
    } finally {
      batchQueue.processing = false;
      
      // Process remaining items in queue
      if (batchQueue.pending.size > 0) {
        setTimeout(processBatch, 100);
      }
    }
  }

  // Schedule batch processing
  function scheduleBatchProcessing() {
    if (batchQueue.batchTimer) {
      clearTimeout(batchQueue.batchTimer);
    }
    
    batchQueue.batchTimer = setTimeout(() => {
      processBatch();
    }, batchQueue.batchTimeout);
  }

  // AI-powered content filtering using batch processing
  async function checkContentWithAI(text) {
    if (!text || text.length < 3) {
      return false;
    }
    
    // Check cache first
    const cacheKey = text.toLowerCase().trim();
    const cached = aiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached.result;
    }
    
    // Add to batch queue
    return new Promise((resolve, reject) => {
      batchQueue.pending.set(text, { resolve, reject, timestamp: Date.now() });
      
      // Schedule processing if not already scheduled
      if (!batchQueue.processing) {
        scheduleBatchProcessing();
      }
      
      // Process immediately if batch is full
      if (batchQueue.pending.size >= batchQueue.batchSize) {
        processBatch();
      }
    });
  }
  
  function cleanCache() {
    const now = Date.now();
    for (const [key, value] of aiCache.entries()) {
      if (now - value.timestamp > CACHE_EXPIRY) {
        aiCache.delete(key);
      }
    }
  }
  
  // Hybrid content filtering: AI + fallback to word lists
  async function isContentInappropriate(text) {
    if (!text || text.length < 2) return false;
    
    // Quick checks for obviously inappropriate content
    const explicitTerms = ['pornhub', 'xhamster', 'xxx.com', 'redtube'];
    if (explicitTerms.some(term => text.toLowerCase().includes(term))) {
      return true;
    }
    
    // Quick checks for obviously legitimate content
    const legitimateTerms = [
      'analytics', 'business', 'professional', 'education', 'news',
      'technology', 'science', 'health', 'finance', 'sports',
      'weather', 'travel', 'cooking', 'gardening', 'politics'
    ];
    if (legitimateTerms.some(term => text.toLowerCase().includes(term))) {
      return false;
    }
    
    // Use AI for ambiguous content (automatic, no user setting needed)
    try {
      return await checkContentWithAI(text);
    } catch (error) {
      // Fallback to basic word filtering if AI fails
      return cachedRegex ? cachedRegex.test(text) : false;
    }
  }

  function isBlurEnabled() {
    return blurEnabled;
  }

  // Link blocking functionality
  function disableBlockedLinks() {
    if (!isBlurEnabled()) return;
    
    // Process all links on the page
    processLinks();
    
    // Set up observer for new links
    const linkObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'A') {
              processLink(node);
            } else {
              const links = node.querySelectorAll('a');
              links.forEach(processLink);
            }
          }
        });
      });
    });
    
    linkObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function processLinks() {
    const links = document.querySelectorAll('a[href]');
    links.forEach(processLink);
  }

  function processLink(link) {
    if (!link || !link.href) return;
    
    const url = link.href.toLowerCase();
    
    // Check if URL contains blocked words
    if (containsBlockedWords(url)) {
      // Disable the link
      link.style.pointerEvents = 'none';
      link.removeAttribute('href');
      
      // Add visual indication
      link.style.opacity = '0.5';
      link.style.textDecoration = 'line-through';
      
      // Prevent clicks
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }, true);
      
      link.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }, true);
      
      link.addEventListener('mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }, true);
      
      logWithTimestamp('log', 'Blocked link:', url);
    }
  }

  function containsBlockedWords(url) {
    if (!url) return false;
    
    // Use the same word list as background script
    const regex = buildWordRegex();
    if (!regex) return false;
    
    return regex.test(url);
  }

  // Function to do a complete rescan
  function fullRescan() {
    // Load settings first, then process if enabled
    loadBlurSettings(() => {
      if (isBlurEnabled()) {
        loadWordsAndProcess();
        disableBlockedLinks();
      }
    });
  }

  // Listen for settings changes
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.type === 'settingsChanged') {
          blurEnabled = message.settings.blurEnabled;
          
          if (!blurEnabled) {
            // Remove all existing blurs
            clearExistingBlurs(document.documentElement);
          } else {
            // Re-apply blurring with new settings
            fullRescan();
          }
        }
      } catch (error) {
        logWithTimestamp('error', 'Error handling message:', error);
      }
    });
  } catch (error) {
    logWithTimestamp('error', 'Extension context invalidated, message listener not available:', error);
  }

  // Enhanced initialization for better SPA support
  function initializeExtension() {
    fullRescan();
    
    // Only set up Chrome API listeners if extension context is valid
    if (isExtensionContextValid()) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      
      // Multiple follow-up scans for slow-loading content (GitHub, etc.)
      setTimeout(() => {
        if (isBlurEnabled()) loadWordsAndProcess();
      }, 500);
      
      setTimeout(() => {
        if (isBlurEnabled()) loadWordsAndProcess();
      }, 1500);
      
      setTimeout(() => {
        if (isBlurEnabled()) loadWordsAndProcess();
      }, 3000);
      
      // Periodic rescan for dynamic content (much less frequent)
      setInterval(() => {
        if (isExtensionContextValid()) {
          loadBlurSettings(() => {
            if (isBlurEnabled()) {
              processSubtree(document.documentElement, cachedRegex);
              // Skip heavy input processing in periodic scans
            }
          });
        }
      }, 60000); // Rescan every 60 seconds
    } else {
      logWithTimestamp('warn', 'Extension context invalid, running in fallback mode');
      // Fallback mode - still process content but without Chrome API features
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeExtension);
  } else {
    initializeExtension();
  }
})();