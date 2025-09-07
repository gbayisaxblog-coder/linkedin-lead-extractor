const { redisClient } = require('../utils/queue');

class CacheService {
  constructor() {
    this.domainTTL = 7 * 24 * 60 * 60; // 7 days for domains
    this.ceoTTL = 24 * 60 * 60; // 1 day for CEOs
  }
  
  async getDomain(companyName) {
    try {
      if (!redisClient || !redisClient.isReady) {
        console.log('⚠️ Redis not ready, skipping cache');
        return null;
      }
      
      const key = `domain:${companyName.toLowerCase().trim()}`;
      const cached = await redisClient.get(key);
      
      if (cached) {
        console.log(`✅ Cache hit for domain: ${companyName} = ${cached}`);
        return cached === 'NOT_FOUND' ? null : cached;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Cache get error:', error);
      return null;
    }
  }
  
  async setDomain(companyName, domain) {
    try {
      if (!redisClient || !redisClient.isReady) {
        console.log('⚠️ Redis not ready, skipping cache');
        return;
      }
      
      const key = `domain:${companyName.toLowerCase().trim()}`;
      const value = domain || 'NOT_FOUND';
      
      await redisClient.setEx(key, this.domainTTL, value);
      console.log(`✅ Cached domain: ${companyName} = ${value} (TTL: ${this.domainTTL}s)`);
    } catch (error) {
      console.error('❌ Cache set error:', error);
    }
  }
}

module.exports = new CacheService();