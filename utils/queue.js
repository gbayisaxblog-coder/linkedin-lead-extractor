const { Queue } = require('bullmq');
const Redis = require('redis');

let redisClient;
let domainQueue;

async function initializeQueues() {
  try {
    console.log('🔄 Initializing Redis and queues...');
    
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL
    });
    
    await redisClient.connect();
    console.log('✅ Redis connected');
    
    // Create queues
    domainQueue = new Queue('domain-finding', {
      connection: redisClient
    });
    
    console.log('✅ Queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

module.exports = {
  initializeQueues,
  domainQueue
};