// Simple in-memory rate limiter per IP and route
// Not production-grade, but sufficient for development and basic protection

const buckets = new Map();

function getBucketKey(ip, routeKey) {
  return `${ip}|${routeKey}`;
}

/**
 * Create a middleware that limits requests per minute per IP for a specific key
 * @param {object} options
 * @param {string} options.key - Route key/name
 * @param {number} options.limit - Max requests per minute
 */
function rateLimit({ key, limit = 60 } = {}) {
  if (!key) throw new Error("rateLimit middleware requires a key");

  return (req, res, next) => {
    try {
      const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
      const bucketKey = getBucketKey(ip, key);
      const now = Date.now();

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = { count: 0, resetAt: now + 60 * 1000 };
        buckets.set(bucketKey, bucket);
      }

      if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + 60 * 1000;
      }

      if (bucket.count >= limit) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        });
      }

      bucket.count += 1;
      next();
    } catch (error) {
      // On limiter error, allow the request rather than blocking everything
      next();
    }
  };
}

module.exports = { rateLimit };


