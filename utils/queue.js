const Queue = require('bull');

const domainQueue = new Queue('domain discovery', process.env.REDIS_URL);
const emailQueue = new Queue('email validation', process.env.REDIS_URL);
const ceoQueue = new Queue('ceo finding', process.env.REDIS_URL);

// We'll set up the processors after creating the queues to avoid circular dependencies
setTimeout(() => {
  domainQueue.process(10, require('../workers/domainWorker'));
  emailQueue.process(5, require('../workers/emailWorker'));
  ceoQueue.process(8, require('../workers/ceoWorker'));
}, 1000);

module.exports = {
  domainQueue,
  emailQueue,
  ceoQueue
};