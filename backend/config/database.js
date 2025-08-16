const Redis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redis;

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Let ioredis handle retries
    retryStrategy: (times) => Math.min(times * 50, 2000), // backoff
  });

  redis.on("connect", () => {
    console.log("✅ Connected to Redis");
  });

  redis.on("error", (err) => {
    console.error("❌ Redis connection error:", err.message);
  });
} catch (error) {
  console.error("❌ Failed to initialize Redis:", error.message);
  process.exit(1); // Fatal error
}

module.exports = redis;
