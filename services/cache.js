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
}

module.exports = new CacheService();