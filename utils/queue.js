// utils/queue.js - FIXED VERSION WITH PROPER EXPORTS
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

// Global variables to store queue instances
let redisConnection = null;
let domainQueue = null;
let ceoQueue = null;
let emailQueue = null;
let initialized = false;

async function initializeQueues() {
  try {
    console.log('🔄 Initializing Redis and queues...');
    
    if (initialized) {
      console.log('✅ Queues already initialized');
      return;
    }
    
    // Create Redis connection using Railway environment variable
    redisConnection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true
    });
    
    await redisConnection.ping();
    console.log('✅ Redis connected and responding');
    
    // Create queues
    domainQueue = new Queue('domain-finding', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        }
      }
    });
    
    ceoQueue = new Queue('ceo-finding', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 3000,
        }
      }
    });
    
    emailQueue = new Queue('email-finding', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        }
      }
    });
    
    initialized = true;
    console.log('✅ All queues initialized successfully');
    console.log('✅ Domain queue created:', !!domainQueue);
    console.log('✅ CEO queue created:', !!ceoQueue);
    console.log('✅ Email queue created:', !!emailQueue);
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

async function startWorkers() {
  try {
    console.log('🔄 Starting queue workers...');
    
    if (!initialized || !domainQueue || !ceoQueue || !emailQueue) {
      throw new Error('Queues not initialized before starting workers');
    }
    
    // Domain finding worker
    const domainWorker = new Worker('domain-finding', async (job) => {
      console.log(`🔄 Processing domain job ${job.id} with data:`, job.data);
      
      // Validate job data
      if (!job.data || !job.data.leadId || !job.data.company) {
        console.error(`❌ Invalid job data for job ${job.id}:`, job.data);
        throw new Error('Invalid job data: missing leadId or company');
      }
      
      // Process domain finding
      return require('../workers/domainWorker')(job);
    }, {
      connection: redisConnection,
      concurrency: 3,
      limiter: {
        max: 5,
        duration: 60000
      }
    });
    
    domainWorker.on('completed', (job, result) => {
      console.log(`✅ Domain job ${job.id} completed for company: ${job.data?.company || 'unknown'}`);
    });
    
    domainWorker.on('failed', (job, err) => {
      console.error(`❌ Domain job ${job?.id} failed for company: ${job?.data?.company || 'unknown'}:`, err.message);
    });
    
    domainWorker.on('error', (err) => {
      console.error('❌ Domain worker error:', err);
    });
    
    // CEO finding worker
    const ceoWorker = new Worker('ceo-finding', async (job) => {
      console.log(`🔄 Processing CEO job ${job.id} with data:`, job.data);
      
      // Validate job data
      if (!job.data || !job.data.leadId || !job.data.domain || !job.data.company) {
        console.error(`❌ Invalid CEO job data for job ${job.id}:`, job.data);
        throw new Error('Invalid job data: missing leadId, domain, or company');
      }
      
      return require('../workers/ceoWorker')(job);
    }, {
      connection: redisConnection,
      concurrency: 2,
      limiter: {
        max: 3,
        duration: 60000
      }
    });
    
    ceoWorker.on('completed', (job, result) => {
      console.log(`✅ CEO job ${job.id} completed for company: ${job.data?.company || 'unknown'}`);
    });
    
    ceoWorker.on('failed', (job, err) => {
      console.error(`❌ CEO job ${job?.id} failed for company: ${job?.data?.company || 'unknown'}:`, err.message);
    });
    
    ceoWorker.on('error', (err) => {
      console.error('❌ CEO worker error:', err);
    });
    
    // Email finding worker
    const emailWorker = new Worker('email-finding', require('../workers/emailWorker'), {
      connection: redisConnection,
      concurrency: 5
    });
    
    emailWorker.on('completed', (job, result) => {
      console.log(`✅ Email job ${job.id} completed`);
    });
    
    emailWorker.on('failed', (job, err) => {
      console.error(`❌ Email job ${job?.id} failed:`, err.message);
    });
    
    console.log('✅ All workers started successfully');
    console.log('🔄 Workers are now processing jobs...');
    
    return { domainWorker, ceoWorker, emailWorker };
    
  } catch (error) {
    console.error('❌ Worker startup error:', error);
    throw error;
  }
}

// Add queue monitoring functions
async function getQueueStats() {
  try {
    if (!initialized || !domainQueue || !ceoQueue) {
      return { error: 'Queues not initialized' };
    }
    
    const domainStats = {
      waiting: await domainQueue.getWaiting().then(jobs => jobs.length),
      active: await domainQueue.getActive().then(jobs => jobs.length),
      completed: await domainQueue.getCompleted().then(jobs => jobs.length),
      failed: await domainQueue.getFailed().then(jobs => jobs.length)
    };
    
    const ceoStats = {
      waiting: await ceoQueue.getWaiting().then(jobs => jobs.length),
      active: await ceoQueue.getActive().then(jobs => jobs.length),
      completed: await ceoQueue.getCompleted().then(jobs => jobs.length),
      failed: await ceoQueue.getFailed().then(jobs => jobs.length)
    };
    
    return {
      initialized,
      domain: domainStats,
      ceo: ceoStats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting queue stats:', error);
    return { error: error.message };
  }
}

// Getter functions to ensure we always return current queue instances
function getDomainQueue() {
  console.log('🔍 getDomainQueue called, initialized:', initialized, 'domainQueue exists:', !!domainQueue);
  return domainQueue;
}

function getCeoQueue() {
  console.log('🔍 getCeoQueue called, initialized:', initialized, 'ceoQueue exists:', !!ceoQueue);
  return ceoQueue;
}

function getEmailQueue() {
  console.log('🔍 getEmailQueue called, initialized:', initialized, 'emailQueue exists:', !!emailQueue);
  return emailQueue;
}

// Export everything including getter functions
module.exports = {
  initializeQueues,
  startWorkers,
  getQueueStats,
  getDomainQueue,
  getCeoQueue,
  getEmailQueue,
  // Direct exports (may be null until initialized)
  get domainQueue() { return domainQueue; },
  get ceoQueue() { return ceoQueue; },
  get emailQueue() { return emailQueue; },
  get redisConnection() { return redisConnection; },
  get initialized() { return initialized; }
};