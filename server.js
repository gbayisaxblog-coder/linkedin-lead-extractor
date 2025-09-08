const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 LinkedIn Lead Extractor v3.0 - Starting...');

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
    version: '3.0.0',
    timestamp: new Date().toISOString()
  });
});

// Initialize system
async function startServer() {
  try {
    console.log('🔄 Initializing system...');
    
    // Check required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'DATABLIST_API_KEY',
      'GETPROSPECT_API_KEY',
      'REDIS_URL'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars);
      console.log('✅ Required environment variables:');
      requiredEnvVars.forEach(varName => console.log(`   - ${varName}`));
    } else {
      console.log('✅ All environment variables present');
    }
    
    // Initialize queues and workers
    try {
      const { initializeQueues, startWorkers } = require('./utils/queue');
      await initializeQueues();
      await startWorkers();
      console.log('✅ Queue system initialized');
    } catch (queueError) {
      console.error('⚠️ Queue initialization failed:', queueError.message);
      console.log('⚠️ Server will start without queue workers');
    }
    
    app.listen(PORT, () => {
      console.log('✅ LinkedIn Lead Extractor v3.0 running on port', PORT);
      console.log('🔄 Domain and email finding workers are active');
      console.log('🌐 API Health Check:', `http://localhost:${PORT}/api/health`);
    });
    
  } catch (error) {
    console.error('❌ Server startup error:', error);
    
    app.listen(PORT, () => {
      console.log('⚠️ LinkedIn Lead Extractor v3.0 running in basic mode on port', PORT);
    });
  }
}

startServer();