const { Queue, Worker } = require('bullmq');
const Redis = require('redis');

let redisClient;
let domainQueue;
let ceoQueue;

async function initializeQueues() {
  try {
    console.log('🔄 Initializing Redis and queues...');
    
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL
    });
    
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    
    // Create queues
    domainQueue = new Queue('domain-finding', {
      connection: redisClient
    });
    
    ceoQueue = new Queue('ceo-finding', {
      connection: redisClient
    });
    
    // Set up workers
    console.log('🔧 Setting up queue workers...');
    
    // Domain worker
    new Worker('domain-finding', async (job) => {
      const { domainWorker } = require('../workers/domainWorker');
      return await domainWorker(job);
    }, {
      connection: redisClient,
      concurrency: 5
    });
    
    // CEO worker
    new Worker('ceo-finding', async (job) => {
      const { ceoWorker } = require('../workers/ceoWorker');
      return await ceoWorker(job);
    }, {
      connection: redisClient,
      concurrency: 3
    });
    
    console.log('✅ Workers set up successfully');
    console.log('✅ Queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

module.exports = {
  initializeQueues,
  domainQueue,
  ceoQueue,
  redisClient
};