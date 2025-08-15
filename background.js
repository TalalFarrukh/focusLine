(() => {
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

  // Same blocked words list as content script
  const BLOCKED_WORDS = [
    'xvideo', 'fap', 'tubsexer', 'youporn', 'lesbian', 'porno', 'xhaccess', 'xhopen', 'xhamster', 'xnxx', 'xvideos', 'pornhub', 'porn', 'pornography', 'xxx', 'nsfw', 'nude', 'nudes', 'naked', 'sex', 'sexual', 'sexy', 'erotic', 'fetish', 'kinky', 'bdsm', 'milf', 'dilf', 'escort', 'prostitute', 'hooker', 'brothel', 'stripper', 'webcam', 'camgirl', 'onlyfans', 'leaked', 'uncensored', 'hardcore', 'softcore', 'explicit', 'mature', 'xrated', 'r-rated', 'adults only', 'eighteenplus', '18+', '21+', 'hookup', 'swingers', 'threesome', 'foursome', 'orgy', 'gangbang', 'bukkake', 'creampie', 'cumshot', 'facial', 'blowjob', 'handjob', 'footjob', 'titjob', 'rimjob', 'anal', 'vaginal', 'oral', 'penetration', 'intercourse', 'masturbation', 'orgasm', 'climax', 'ejaculation', 'arousal', 'horny', 'throbbing', 'pulsing', 'moaning', 'slutty', 'whore', 'cock', 'dick', 'penis', 'balls', 'testicles', 'pussy', 'vagina', 'clit', 'clitoris', 'labia', 'vulva', 'breasts', 'boobs', 'tits', 'nipples', 'butthole', 'anus', 'rectum', 'lingerie', 'panties', 'bra', 'thong', 'g-string', 'revealing', 'skimpy', 'low-cut', 'cleavage', 'upskirt', 'downblouse', 'voyeur', 'exhibitionist', 'flasher', 'streaker', 'striptease', 'lap dance', 'pole dance', 'twerk', 'grind', 'hump', 'thrust', 'seduce', 'fondle', 'grope', 'spank', 'whip', 'bind', 'restrain', 'dominate', 'submit', 'master', 'mistress', 'dom', 'sub', 'kink', 'taboo', 'lust', 'fantasy', 'roleplay', 'undress', 'strip', 'expose'
  ];

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildWordRegex() {
    if (BLOCKED_WORDS.length === 0) return null;
    
    const sanitized = BLOCKED_WORDS
      .filter(Boolean)
      .map(w => escapeRegex(w.trim()))
      .filter(Boolean);
    
    // Match any word that contains blocked words as substrings
    const pattern = `\\b\\w*(?:${sanitized.join("|")})\\w*\\b`;
    return new RegExp(pattern, "gi");
  }

  function containsBlockedWords(url) {
    if (!url) return false;
    const regex = buildWordRegex();
    if (!regex) return false;
    
    // Check the entire URL including domain, path, and query parameters
    return regex.test(url);
  }

  // Check if tab blocking is enabled
  function isTabBlockingEnabled(callback) {
    chrome.storage.sync.get({ tabBlockingEnabled: true }, (items) => {
      callback(items.tabBlockingEnabled);
    });
  }

  // Listen for navigation attempts
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Only process main frame navigation (not iframes)
    if (details.frameId !== 0) return;
    
    isTabBlockingEnabled((enabled) => {
      if (!enabled) return;
      
      const url = details.url;
      logWithTimestamp('log', 'Checking navigation to:', url);
      
      if (containsBlockedWords(url)) {
        logWithTimestamp('log', 'Blocked navigation detected, closing tab:', details.tabId);
        
        // Close the tab immediately
        chrome.tabs.remove(details.tabId).catch((error) => {
          logWithTimestamp('error', 'Error closing tab:', error);
        });
      }
    });
  });

  // Also listen for tab updates (when URL changes in address bar)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    
    isTabBlockingEnabled((enabled) => {
      if (!enabled) return;
      
      if (containsBlockedWords(changeInfo.url)) {
        logWithTimestamp('log', 'Blocked URL detected in tab update, closing tab:', tabId);
        
        chrome.tabs.remove(tabId).catch((error) => {
          logWithTimestamp('error', 'Error closing tab:', error);
        });
      }
    });
  });

  // Listen for new tabs created with blocked URLs
  chrome.tabs.onCreated.addListener((tab) => {
    if (!tab.url) return;
    
    isTabBlockingEnabled((enabled) => {
      if (!enabled) return;
      
      if (containsBlockedWords(tab.url)) {
        logWithTimestamp('log', 'Blocked URL detected in new tab, closing tab:', tab.id);
        
        chrome.tabs.remove(tab.id).catch((error) => {
          logWithTimestamp('error', 'Error closing tab:', error);
        });
      }
    });
  });

  // Listen for settings changes from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'settingsChanged') {
      logWithTimestamp('log', 'Settings updated:', message.settings);
    }
  });

  logWithTimestamp('log', 'Background service worker initialized - URL blocking active');
})();
