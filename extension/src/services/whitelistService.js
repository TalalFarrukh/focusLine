/**
 * FocusLine Whitelist Service
 * Manages hard-coded whitelists for tab blocking and content analysis
 */

/**
 * Hard-coded whitelist for tab blocking
 * Domains that should never be blocked when opening new tabs
 */
const TAB_BLOCKING_WHITELIST = [
    'github.com',
    'stackoverflow.com',
    'apple.com',
    'microsoft.com',
    'amazon.com',
    'web.whatsapp.com',
    'disney.com',
    'accounts.google.com',
    'figma.com',
    'linkedin.com',
    'mail.google.com'
];

/**
 * Hard-coded whitelist for content analysis
 * Domains where content analysis should be completely skipped
 */
const CONTENT_ANALYSIS_WHITELIST = [
    'github.com',
    'stackoverflow.com',
    'apple.com',
    'microsoft.com',
    'amazon.com',
    'web.whatsapp.com',
    'disney.com',
    'accounts.google.com',
    'figma.com',
    'linkedin.com',
    'mail.google.com'
];

/**
 * Normalize domain by removing protocol, www, and trailing slashes
 * @param {string} domain - Domain to normalize
 * @returns {string} Normalized domain
 */
function normalizeDomain(domain) {
  if (!domain) return '';

  try {
    // Handle URLs and domains
    let normalized = domain.toLowerCase();

    // Remove protocol if present
    normalized = normalized.replace(/^https?:\/\//, '');

    // Remove www. prefix
    normalized = normalized.replace(/^www\./, '');

    // Remove trailing slash and anything after it
    normalized = normalized.split('/')[0];

    // Remove port if present
    normalized = normalized.split(':')[0];

    return normalized;
  } catch (error) {
    console.warn('FocusLine Whitelist: Error normalizing domain:', domain, error);
    return domain.toLowerCase();
  }
}

/**
 * Check if a domain matches any entry in the whitelist
 * Implements flexible domain matching:
 * - Exact match: www.xyz.com ↔ www.xyz.com ✅
 * - Subpath match: www.xyz.com ↔ www.xyz.com/potato ✅
 * - Subdomain match: www.xyz.com ↔ xyz.com ✅
 * - Subdomain + subpath: www.xyz.com ↔ xyz.com/potato ✅
 * - Different domain: www.xyz.com ↔ ww.xy.com ❌
 *
 * @param {string} currentDomain - Current domain to check
 * @param {string[]} whitelist - Array of whitelisted domains
 * @returns {boolean} True if domain is whitelisted
 */
function isDomainWhitelisted(currentDomain, whitelist) {
  if (!currentDomain || !Array.isArray(whitelist)) {
    return false;
  }

  const normalizedCurrent = normalizeDomain(currentDomain);

  // Check each whitelist entry
  for (const whitelistDomain of whitelist) {
    const normalizedWhitelist = normalizeDomain(whitelistDomain);

    // Exact match
    if (normalizedCurrent === normalizedWhitelist) {
      return true;
    }

    // Check if current domain is a subdomain of whitelist domain
    // e.g., "sub.google.com" matches "google.com"
    if (normalizedCurrent.endsWith('.' + normalizedWhitelist)) {
      return true;
    }

    // Check if whitelist domain is a subdomain of current domain
    // e.g., "google.com" matches "www.google.com"
    if (normalizedWhitelist.endsWith('.' + normalizedCurrent)) {
      return true;
    }
  }

  return false;
}

class WhitelistService {
  /**
   * Check if a domain should be whitelisted for tab blocking
   * @param {string} domain - Domain to check
   * @returns {boolean} True if domain should be whitelisted for tab blocking
   */
  static isTabBlockingWhitelisted(domain) {
    return isDomainWhitelisted(domain, TAB_BLOCKING_WHITELIST);
  }

  /**
   * Check if a domain should be whitelisted for content analysis
   * @param {string} domain - Domain to check
   * @returns {boolean} True if domain should be whitelisted for content analysis
   */
  static isContentAnalysisWhitelisted(domain) {
    return isDomainWhitelisted(domain, CONTENT_ANALYSIS_WHITELIST);
  }

  /**
   * Get the tab blocking whitelist (for debugging)
   * @returns {string[]} Array of whitelisted domains
   */
  static getTabBlockingWhitelist() {
    return [...TAB_BLOCKING_WHITELIST];
  }

  /**
   * Get the content analysis whitelist (for debugging)
   * @returns {string[]} Array of whitelisted domains
   */
  static getContentAnalysisWhitelist() {
    return [...CONTENT_ANALYSIS_WHITELIST];
  }

  /**
   * Check if a URL is whitelisted for tab blocking
   * @param {string} url - Full URL to check
   * @returns {boolean} True if URL should be whitelisted for tab blocking
   */
  static isUrlTabBlockingWhitelisted(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      return this.isTabBlockingWhitelisted(urlObj.hostname);
    } catch (error) {
      console.warn('FocusLine Whitelist: Error parsing URL:', url, error);
      return false;
    }
  }

  /**
   * Check if a URL is whitelisted for content analysis
   * @param {string} url - Full URL to check
   * @returns {boolean} True if URL should be whitelisted for content analysis
   */
  static isUrlContentAnalysisWhitelisted(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      return this.isContentAnalysisWhitelisted(urlObj.hostname);
    } catch (error) {
      console.warn('FocusLine Whitelist: Error parsing URL:', url, error);
      return false;
    }
  }
}

export default WhitelistService;
