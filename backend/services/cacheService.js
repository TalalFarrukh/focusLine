const redis = require("../config/database");

/**
 * Set a cache key with expiration
 * @param {string} key - cache key
 * @param {any} value - value to store
 * @param {number} ttl - time-to-live in seconds (default: 3600s = 1h)
 */
const setCache = async (key, value, ttl = 3600) => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
    return true;
  } catch (error) {
    console.error("Redis setCache error:", error.message);
    return false;
  }
};

/**
 * Get a cache key
 * @param {string} key - cache key
 * @returns {any|null} - parsed value or null
 */
const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Redis getCache error:", error.message);
    return null;
  }
};

/**
 * Delete a cache key
 * @param {string} key - cache key
 */
const deleteCache = async (key) => {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error("Redis deleteCache error:", error.message);
    return false;
  }
};

module.exports = { setCache, getCache, deleteCache };
