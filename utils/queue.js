const Queue = require('bull');

console.log('🔄 Setting up queues...');

// Create queues with proper Redis connection
const domainQueue = new Queue('domain discovery', process.env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 3,
    attempts: 2,
    backoff: 'exponential'
  }
});

const emailQueue = new Queue('email validation', process.env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 3,
    attempts: 2,
    backoff: 'exponential'
  }
});

const ceoQueue = new Queue('ceo finding', process.env.REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 3,
    attempts: 2,
    backoff: 'exponential'
  }
});

// Set up processors with error handling
console.log('🔧 Setting up queue processors...');

try {
  // Set up domain queue processor
  domainQueue.process('find-domain', 3, async (job) => {
    console.log(`🔍 Domain worker processing lead ${job.data.leadId}`);
    const domainWorker = require('../workers/domainWorker');
    return await domainWorker(job);
  });

  // Set up CEO queue processor  
  ceoQueue.process('find-ceo', 2, async (job) => {
    console.log(`👔 CEO worker processing lead ${job.data.leadId}`);
    const ceoWorker = require('../workers/ceoWorker');
    return await ceoWorker(job);
  });

  console.log('✅ All queue processors set up successfully');
} catch (error) {
  console.error('❌ Error setting up queue processors:', error);
}

// Add event listeners for debugging
domainQueue.on('completed', (job, result) => {
  console.log(`✅ Domain job completed for lead ${job.data.leadId}:`, result);
});

ceoQueue.on('completed', (job, result) => {
  console.log(`✅ CEO job completed for lead ${job.data.leadId}:`, result);
});

domainQueue.on('failed', (job, err) => {
  console.log(`❌ Domain job failed for lead ${job.data.leadId}:`, err.message);
});

ceoQueue.on('failed', (job, err) => {
  console.log(`❌ CEO job failed for lead ${job.data.leadId}:`, err.message);
});

domainQueue.on('error', (error) => {
  console.error('❌ Domain queue error:', error);
});

ceoQueue.on('error', (error) => {
  console.error('❌ CEO queue error:', error);
});

module.exports = {
  domainQueue,
  emailQueue,
  ceoQueue
};