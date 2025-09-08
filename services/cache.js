// services/cache.js - FIXED WITH FLUSHALL METHOD
const redis = require('redis');

class CacheService {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL
    });
    
    this.client.on('error', (err) => {
      console.error('❌ Redis error:', err);
    });
    
    this.client.on('connect', () => {
      console.log('✅ Redis connected');
    });
    
    this.client.connect();
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      if (value) {
        console.log(`✅ Cache hit for: ${key}`);
      }
      return value;
    } catch (error) {
      console.error('❌ Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 86400) {
    try {
      await this.client.setEx(key, ttl, value);
      console.log(`✅ Cached: ${key} = ${value} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      console.error('❌ Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      console.log(`✅ Cache deleted: ${key}`);
      return true;
    } catch (error) {
      console.error('❌ Cache del error:', error);
      return false;
    }
  }

  // NEW: Add flushall method
  async flushall() {
    try {
      await this.client.flushAll();
      console.log(`🧹 ALL CACHE CLEARED`);
      return 'OK';
    } catch (error) {
      console.error('❌ Cache flushall error:', error);
      return false;
    }
  }

  // NEW: Clear specific patterns
  async clearPattern(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🧹 Cleared ${keys.length} keys matching pattern: ${pattern}`);
        return keys.length;
      }
      return 0;
    } catch (error) {
      console.error('❌ Cache clear pattern error:', error);
      return 0;
    }
  }

  // NEW: Clear all domain cache
  async clearAllDomainCache() {
    return await this.clearPattern('domain:*');
  }

  // NEW: Clear all CEO cache
  async clearAllCEOCache() {
    return await this.clearPattern('ceo:*');
  }
}

module.exports = new CacheService();