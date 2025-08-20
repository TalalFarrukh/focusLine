/**
 * Content Extractor Service
 * Handles DOM text extraction, element identification, and context gathering
 */
class ContentExtractor {
  constructor() {
    this.ignoredTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD'];
    this.ignoredClasses = ['fl-blur', 'fl-blocked', 'fl-ignored'];
    this.maxTextLength = 10000; // Maximum text length to extract
  }

  /**
   * Extract all text content from the page
   * @returns {object} - Extracted content with metadata
   */
  extractPageContent() {
    try {
      const content = {
        url: window.location.href,
        title: document.title,
        textNodes: [],
        links: [],
        images: [],
        metadata: this._extractMetadata(),
        timestamp: new Date().toISOString()
      };

      // Extract text nodes
      content.textNodes = this._extractTextNodes();
      
      // Extract links
      content.links = this._extractLinks();
      
      // Extract images
      content.images = this._extractImages();

      return content;
    } catch (error) {
      console.error('Content extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract text nodes with context
   * @returns {Array} - Array of text node objects
   */
  _extractTextNodes() {
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if parent is ignored
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          if (this.ignoredTags.includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if parent has ignored class
          if (this.ignoredClasses.some(cls => parent.classList.contains(cls))) {
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
          context: this._getNodeContext(node),
          position: this._getNodePosition(node)
        });
      }
    }

    return textNodes;
  }

  /**
   * Extract links with context
   * @returns {Array} - Array of link objects
   */
  _extractLinks() {
    const links = [];
    const linkElements = document.querySelectorAll('a[href]');

    linkElements.forEach(link => {
      const url = link.href;
      const text = link.textContent.trim();
      
      if (text.length > 0 && url) {
        links.push({
          url: url,
          text: text,
          title: link.title || '',
          element: link,
          context: this._getElementContext(link)
        });
      }
    });

    return links;
  }

  /**
   * Extract images with context
   * @returns {Array} - Array of image objects
   */
  _extractImages() {
    const images = [];
    const imageElements = document.querySelectorAll('img');

    imageElements.forEach(img => {
      const src = img.src;
      const alt = img.alt || '';
      const title = img.title || '';
      
      if (src) {
        images.push({
          src: src,
          alt: alt,
          title: title,
          element: img,
          context: this._getElementContext(img)
        });
      }
    });

    return images;
  }

  /**
   * Get context for a text node
   * @param {Node} node - Text node
   * @returns {object} - Context information
   */
  _getNodeContext(node) {
    const parent = node.parentElement;
    if (!parent) return {};

    return {
      tagName: parent.tagName,
      className: parent.className,
      id: parent.id,
      role: parent.getAttribute('role'),
      ariaLabel: parent.getAttribute('aria-label'),
      surroundingText: this._getSurroundingText(node, 200),
      fullContext: parent.textContent.trim().substring(0, 500)
    };
  }

  /**
   * Get context for an element
   * @param {Element} element - DOM element
   * @returns {object} - Context information
   */
  _getElementContext(element) {
    return {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      parentContext: element.parentElement ? {
        tagName: element.parentElement.tagName,
        className: element.parentElement.className
      } : null
    };
  }

  /**
   * Get surrounding text for a node
   * @param {Node} node - Text node
   * @param {number} radius - Number of characters to include
   * @returns {string} - Surrounding text
   */
  _getSurroundingText(node, radius = 200) {
    try {
      const parent = node.parentElement;
      if (!parent) return '';

      const fullText = parent.textContent;
      const nodeText = node.textContent;
      const nodeIndex = fullText.indexOf(nodeText);
      
      if (nodeIndex === -1) return '';

      const start = Math.max(0, nodeIndex - radius);
      const end = Math.min(fullText.length, nodeIndex + nodeText.length + radius);
      
      return fullText.substring(start, end);
    } catch (error) {
      return '';
    }
  }

  /**
   * Get position information for a node
   * @param {Node} node - Text node
   * @returns {object} - Position information
   */
  _getNodePosition(node) {
    try {
      const parent = node.parentElement;
      if (!parent) return {};

      const rect = parent.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Extract page metadata
   * @returns {object} - Metadata information
   */
  _extractMetadata() {
    const metadata = {
      description: '',
      keywords: '',
      author: '',
      category: this._determinePageCategory()
    };

    // Extract meta tags
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      
      if (name && content) {
        switch (name.toLowerCase()) {
          case 'description':
            metadata.description = content;
            break;
          case 'keywords':
            metadata.keywords = content;
            break;
          case 'author':
            metadata.author = content;
            break;
        }
      }
    });

    return metadata;
  }

  /**
   * Determine page category based on URL and content
   * @returns {string} - Page category
   */
  _determinePageCategory() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    
    const categories = {
      news: ['news', 'article', 'story', 'report'],
      social: ['facebook', 'twitter', 'instagram', 'social'],
      shopping: ['amazon', 'ebay', 'shop', 'store', 'buy'],
      educational: ['education', 'learn', 'course', 'tutorial', 'academic'],
      health: ['health', 'medical', 'doctor', 'hospital'],
      technology: ['tech', 'technology', 'software', 'programming'],
      entertainment: ['movie', 'music', 'game', 'entertainment']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => url.includes(keyword) || title.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Extract content for a specific element
   * @param {Element} element - DOM element
   * @returns {object} - Element content
   */
  extractElementContent(element) {
    if (!element) return null;

    return {
      tagName: element.tagName,
      text: element.textContent.trim(),
      html: element.outerHTML,
      context: this._getElementContext(element),
      position: this._getNodePosition(element)
    };
  }

  /**
   * Check if content has changed since last extraction
   * @param {object} previousContent - Previous content
   * @param {object} currentContent - Current content
   * @returns {boolean} - True if content changed
   */
  hasContentChanged(previousContent, currentContent) {
    if (!previousContent || !currentContent) return true;
    
    // Simple comparison - can be enhanced
    return JSON.stringify(previousContent) !== JSON.stringify(currentContent);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentExtractor;
} else {
  // For browser environment
  window.ContentExtractor = ContentExtractor;
}
