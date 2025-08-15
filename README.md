# FocusLine – Adult Content Filter (Chrome Extension)

Automatically blur adult and explicit content across all websites for a safer browsing experience. Uses intelligent filtering with AI-powered detection and comprehensive word lists.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode (top-right).
3. Click "Load unpacked" and select this folder.
4. The extension works immediately - no configuration needed.
5. Refresh any open pages to apply filtering.

## Files
- `manifest.json` – Extension manifest (MV3)
- `content.js` / `content.css` – Content filtering and blur effects
- `popup.html` / `popup.js` / `popup.css` – Extension popup interface
- `background.js` – Tab blocking functionality

## Features
- **Intelligent filtering**: Combines AI-powered detection with comprehensive word lists for maximum accuracy
- **Automatic operation**: AI filtering works seamlessly in the background - no user configuration needed
- **Performance optimized**: Efficient processing with debouncing and batch operations
- **Privacy focused**: AI requests are cached and fallback to local filtering when needed
- **Tab blocking**: Automatically closes tabs with adult URLs
- **Accessibility friendly**: Hover over blurred content to reveal it temporarily

## Settings
Click the extension icon to access settings:
- **Content Blurring**: Enable/disable blurring of adult content on webpages
- **Tab Blocking**: Enable/disable automatic closing of tabs with adult URLs

## Notes
- Filtering is case-insensitive and avoids editable fields, code blocks, and script areas
- The filter list is centrally managed and cannot be modified by users
- AI filtering requires internet connection but gracefully falls back to local filtering when unavailable
- To permanently blur content (remove hover reveal), edit the `:hover` rule in `content.css`
