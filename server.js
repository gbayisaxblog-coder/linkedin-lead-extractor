// server.js - COMPLETE FIXED VERSION
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 LinkedIn Lead Extractor v2.0 - Starting...');
console.log('🔧 Environment:', process.env.NODE_ENV || 'development');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/files', require('./routes/files'));
app.use('/api/extraction', require('./routes/extraction'));
app.use('/api/export', require('./routes/export'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// server.js - ADD DEBUGGING
// ... existing code ...

// Initialize queues and start workers
async function startServer() {
  try {
    console.log('🔄 Initializing system...');
    
    // Check required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'BRIGHTDATA_API_KEY',
      'OPENAI_API_KEY',
      'REDIS_URL'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      console.log('✅ Make sure these are set in Railway:');
      missingVars.forEach(varName => console.log(`   - ${varName}`));
    } else {
      console.log('✅ All environment variables present');
    }
    
    // Initialize queues and workers
    try {
      const { initializeQueues, startWorkers } = require('./utils/queue');
      
      // Initialize queues
      console.log('🔄 DEBUG: About to initialize queues...');
      await initializeQueues();
      console.log('✅ DEBUG: Queues initialized successfully');
      
      // Test queue availability immediately after initialization
      const queueModule = require('./utils/queue');
      const { domainQueue } = queueModule;
      console.log('🔍 DEBUG: Domain queue available after init:', !!domainQueue);
      
      // Start workers
      console.log('🔄 DEBUG: About to start workers...');
      await startWorkers();
      console.log('✅ DEBUG: Workers started successfully');
      
      // Test queue availability after workers start
      const { domainQueue: domainQueueAfterWorkers } = require('./utils/queue');
      console.log('🔍 DEBUG: Domain queue available after workers:', !!domainQueueAfterWorkers);
      
    } catch (queueError) {
      console.error('⚠️ Queue initialization failed:', queueError.message);
      console.error('⚠️ Queue error stack:', queueError.stack);
      console.log('⚠️ Server will start without queue workers');
      console.log('⚠️ Manual processing will be required for domain/CEO finding');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log('✅ LinkedIn Lead Extractor v2.0 running on port', PORT);
      console.log('🔄 Domain and CEO finding workers are active (if queues initialized)');
      console.log('🌐 API Health Check:', `http://localhost:${PORT}/api/health`);
      
      // Final queue test after server starts
      setTimeout(() => {
        try {
          const queueModule = require('./utils/queue');
          const { domainQueue } = queueModule;
          console.log('🔍 DEBUG: Final domain queue check after server start:', !!domainQueue);
        } catch (finalTestError) {
          console.error('❌ DEBUG: Final queue test failed:', finalTestError.message);
        }
      }, 2000);
    });
    
  } catch (error) {
    console.error('❌ Server startup error:', error);
    console.log('🔄 Starting server without advanced features...');
    
    // Start basic server even if queue setup fails
    app.listen(PORT, () => {
      console.log('⚠️ LinkedIn Lead Extractor v2.0 running in basic mode on port', PORT);
      console.log('⚠️ Queue workers disabled - manual processing required');
    });
  }
}

startServer();

// Initialize queues and start workers
async function startServer() {
  try {
    console.log('🔄 Initializing system...');
    
    // Check required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'BRIGHTDATA_API_KEY',
      'OPENAI_API_KEY',
      'REDIS_URL'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      console.log('✅ Make sure these are set in Railway:');
      missingVars.forEach(varName => console.log(`   - ${varName}`));
    } else {
      console.log('✅ All environment variables present');
    }
    
    // Initialize queues and workers
    try {
      const { initializeQueues, startWorkers } = require('./utils/queue');
      
      // Initialize queues
      await initializeQueues();
      console.log('✅ Queues initialized');
      
      // Start workers
      await startWorkers();
      console.log('✅ Workers started');
      
    } catch (queueError) {
      console.error('⚠️ Queue initialization failed:', queueError.message);
      console.log('⚠️ Server will start without queue workers');
      console.log('⚠️ Manual processing will be required for domain/CEO finding');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log('✅ LinkedIn Lead Extractor v2.0 running on port', PORT);
      console.log('🔄 Domain and CEO finding workers are active (if queues initialized)');
      console.log('🌐 API Health Check:', `http://localhost:${PORT}/api/health`);
    });
    
  } catch (error) {
    console.error('❌ Server startup error:', error);
    console.log('🔄 Starting server without advanced features...');
    
    // Start basic server even if queue setup fails
    app.listen(PORT, () => {
      console.log('⚠️ LinkedIn Lead Extractor v2.0 running in basic mode on port', PORT);
      console.log('⚠️ Queue workers disabled - manual processing required');
    });
  }
}

startServer();