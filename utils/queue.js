// utils/queue.js - COMPLETE FIXED VERSION
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

let redisConnection;
let domainQueue;
let ceoQueue;
let emailQueue;

async function initializeQueues() {
  try {
    console.log('🔄 Initializing Redis and queues...');
    
    // Create Redis connection using Railway environment variable
    redisConnection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true
    });
    
    console.log('✅ Redis connected');
    
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
    
    console.log('✅ All queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

async function startWorkers() {
  try {
    console.log('🔄 Starting queue workers...');
    
    // Domain finding worker
    const domainWorker = new Worker('domain-finding', require('../workers/domainWorker'), {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000 // 10 jobs per minute
      }
    });
    
    domainWorker.on('completed', (job) => {
      console.log(`✅ Domain job ${job.id} completed`);
    });
    
    domainWorker.on('failed', (job, err) => {
      console.error(`❌ Domain job ${job.id} failed:`, err.message);
    });
    
    // CEO finding worker
    const ceoWorker = new Worker('ceo-finding', require('../workers/ceoWorker'), {
      connection: redisConnection,
      concurrency: 3,
      limiter: {
        max: 6,
        duration: 60000 // 6 jobs per minute
      }
    });
    
    ceoWorker.on('completed', (job) => {
      console.log(`✅ CEO job ${job.id} completed`);
    });
    
    ceoWorker.on('failed', (job, err) => {
      console.error(`❌ CEO job ${job.id} failed:`, err.message);
    });
    
    // Email finding worker
    const emailWorker = new Worker('email-finding', require('../workers/emailWorker'), {
      connection: redisConnection,
      concurrency: 10
    });
    
    emailWorker.on('completed', (job) => {
      console.log(`✅ Email job ${job.id} completed`);
    });
    
    emailWorker.on('failed', (job, err) => {
      console.error(`❌ Email job ${job.id} failed:`, err.message);
    });
    
    console.log('✅ All workers started successfully');
    
    return { domainWorker, ceoWorker, emailWorker };
    
  } catch (error) {
    console.error('❌ Worker startup error:', error);
    throw error;
  }
}

module.exports = {
  initializeQueues,
  startWorkers,
  domainQueue,
  ceoQueue,
  emailQueue,
  redisConnection
};