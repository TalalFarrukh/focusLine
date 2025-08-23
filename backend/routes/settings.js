const express = require('express');
const { setCache, getCache } = require('../services/cacheService');

const router = express.Router();

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  tabBlockingEnabled: true,
  contentAnalysisEnabled: true,
  sensitivity: 'moderate', // 'low', 'moderate', 'high'
  blockThreshold: 7, // 1-10 scale
  cacheEnabled: true,
  notificationsEnabled: true,
  autoBlockExplicit: true,
  allowUserOverride: false
};

/**
 * Get user settings
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const cacheKey = `settings:${userId}`;
    const cachedSettings = await getCache(cacheKey);
    
    const settings = cachedSettings || DEFAULT_SETTINGS;
    
    res.json({
      success: true,
      data: {
        userId,
        settings,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update user settings
 */
router.put('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { settings } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Settings object is required' });
    }

    // Validate settings
    const validatedSettings = { ...DEFAULT_SETTINGS, ...settings };
    
    // Validate sensitivity
    if (!['low', 'moderate', 'high'].includes(validatedSettings.sensitivity)) {
      return res.status(400).json({ success: false, error: 'Invalid sensitivity level' });
    }

    // Validate block threshold
    if (typeof validatedSettings.blockThreshold !== 'number' || 
        validatedSettings.blockThreshold < 1 || 
        validatedSettings.blockThreshold > 10) {
      return res.status(400).json({ success: false, error: 'Block threshold must be between 1 and 10' });
    }

    // Cache settings for 30 days
    const cacheKey = `settings:${userId}`;
    await setCache(cacheKey, validatedSettings, 30 * 24 * 60 * 60);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        userId,
        settings: validatedSettings,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Reset user settings to default
 */
router.delete('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const cacheKey = `settings:${userId}`;
    await setCache(cacheKey, DEFAULT_SETTINGS, 30 * 24 * 60 * 60);

    res.json({
      success: true,
      message: 'Settings reset to default',
      data: {
        userId,
        settings: DEFAULT_SETTINGS,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
