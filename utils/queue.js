const { Queue, Worker } = require('bullmq');
const Redis = require('redis');

let redisClient;
let domainQueue;
let ceoQueue;
let queuesReady = false;

// Global queue registry to avoid module caching issues
global.queueRegistry = global.queueRegistry || {};

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
    
    // ✅ CRITICAL: Store in global registry AND re-export
    global.queueRegistry.domainQueue = domainQueue;
    global.queueRegistry.ceoQueue = ceoQueue;
    global.queueRegistry.redisClient = redisClient;
    
    module.exports.domainQueue = domainQueue;
    module.exports.ceoQueue = ceoQueue;
    module.exports.redisClient = redisClient;
    
    console.log('✅ Queues stored in global registry and re-exported');
    
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
      return { success: true, message: 'CEO worker placeholder' };
    }, {
      connection: redisClient,
      concurrency: 3
    });
    
    console.log('✅ Workers set up successfully');
    
    queuesReady = true;
    console.log('✅ Queues marked as ready');
    console.log('✅ Queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

// Getter functions that use global registry
function getDomainQueue() {
  const queue = global.queueRegistry?.domainQueue || domainQueue;
  console.log('🔍 getDomainQueue called, returning:', !!queue);
  return queue;
}

function getCeoQueue() {
  return global.queueRegistry?.ceoQueue || ceoQueue;
}

function areQueuesReady() {
  const ready = queuesReady && !!(global.queueRegistry?.domainQueue || domainQueue);
  console.log(`🔍 Queue readiness: ${ready} (flag: ${queuesReady}, global: ${!!global.queueRegistry?.domainQueue}, local: ${!!domainQueue})`);
  return ready;
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