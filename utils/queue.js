const { Queue, Worker } = require('bullmq');
const Redis = require('redis');

let redisClient;
let domainQueue;
let ceoQueue;
let queuesReady = false;

async function initializeQueues() {
  try {
    console.log('🔄 Initializing Redis and queues...');
    
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL
    });
    
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    
    // Create queues
    console.log('🔧 Creating domain queue...');
    domainQueue = new Queue('domain-finding', {
      connection: redisClient
    });
    console.log('✅ Domain queue created:', !!domainQueue);
    
    console.log('🔧 Creating CEO queue...');
    ceoQueue = new Queue('ceo-finding', {
      connection: redisClient
    });
    console.log('✅ CEO queue created:', !!ceoQueue);
    
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
    
    // Mark queues as ready
    queuesReady = true;
    console.log('✅ Queues marked as ready');
    
    // Debug: Test queue access
    console.log('🔍 Debug - domainQueue available:', !!domainQueue);
    console.log('🔍 Debug - ceoQueue available:', !!ceoQueue);
    console.log('🔍 Debug - queuesReady flag:', queuesReady);
    
    console.log('✅ Queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

// Export function to check if queues are ready
function areQueuesReady() {
  const ready = queuesReady && !!domainQueue && !!ceoQueue;
  console.log(`🔍 Queue readiness check: ${ready} (flag: ${queuesReady}, domainQueue: ${!!domainQueue}, ceoQueue: ${!!ceoQueue})`);
  return ready;
}

module.exports = {
  initializeQueues,
  domainQueue,
  ceoQueue,
  redisClient,
  areQueuesReady
};