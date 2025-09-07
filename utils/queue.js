const { Queue, Worker } = require('bullmq');
const Redis = require('redis');

let redisClient;
let domainQueue;
let ceoQueue;

async function initializeQueues() {
  try {
    console.log('🔄 Initializing Redis and queues...');
    
    // Create Redis connection
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL
    });
    
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    
    // Create queues
    domainQueue = new Queue('domain-finding', {
      connection: {
        host: redisClient.options.socket.host,
        port: redisClient.options.socket.port,
        password: redisClient.options.password
      }
    });
    
    ceoQueue = new Queue('ceo-finding', {
      connection: {
        host: redisClient.options.socket.host,
        port: redisClient.options.socket.port,
        password: redisClient.options.password
      }
    });
    
    // Set up workers
    setupWorkers();
    
    console.log('✅ Queues initialized successfully');
    
  } catch (error) {
    console.error('❌ Queue initialization error:', error);
    throw error;
  }
}

function setupWorkers() {
  console.log('🔧 Setting up queue workers...');
  
  // Domain worker
  new Worker('domain-finding', async (job) => {
    const { domainWorker } = require('../workers/domainWorker');
    return await domainWorker(job);
  }, {
    connection: {
      host: redisClient.options.socket.host,
      port: redisClient.options.socket.port,
      password: redisClient.options.password
    },
    concurrency: 5
  });
  
  // CEO worker
  new Worker('ceo-finding', async (job) => {
    const { ceoWorker } = require('../workers/ceoWorker');
    return await ceoWorker(job);
  }, {
    connection: {
      host: redisClient.options.socket.host,
      port: redisClient.options.socket.port,
      password: redisClient.options.password
    },
    concurrency: 3
  });
  
  console.log('✅ Workers set up successfully');
}

module.exports = {
  initializeQueues,
  domainQueue,
  ceoQueue,
  redisClient
};