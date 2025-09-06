const redis = require('redis');

class CacheService {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL
    });
    
    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });
    
    this.client.connect();
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      return null;
    }
  }

  async set(key, value, ttl = 86400) {
    try {
      return await this.client.setEx(key, ttl, value);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new CacheService();