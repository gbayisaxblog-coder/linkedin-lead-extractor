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
    
    console.log('🔧 Creating CEO queue...');
    ceoQueue = new Queue('ceo-finding', {
      connection: redisClient
    });
    
    console.log('✅ Queues created - domainQueue:', !!domainQueue, 'ceoQueue:', !!ceoQueue);
    
    // ✅ CRITICAL: Re-export the queues after creation
    module.exports.domainQueue = domainQueue;
    module.exports.ceoQueue = ceoQueue;
    module.exports.redisClient = redisClient;
    
    console.log('✅ Queues re-exported to module.exports');
    
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
      console.log('👔 CEO worker processing job:', job.id);
      // Placeholder for now
      return { success: true, message: 'CEO worker placeholder' };
    }, {
      connection: redisClient,
      concurrency: 3
    });
    
    console.log('✅ Workers set up successfully');
    
    // Mark queues as ready
    queuesReady = true;
    console.log('✅ Queues marked as ready');
    
    console.log('✅ Queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

// Get current queue (always returns the latest instance)
function getDomainQueue() {
  return domainQueue;
}

function getCeoQueue() {
  return ceoQueue;
}

function areQueuesReady() {
  return queuesReady && !!domainQueue && !!ceoQueue;
}

// Initial exports (will be updated after initialization)
module.exports = {
  initializeQueues,
  getDomainQueue,
  getCeoQueue,
  areQueuesReady,
  domainQueue: null, // Will be updated
  ceoQueue: null,    // Will be updated
  redisClient: null  // Will be updated
};