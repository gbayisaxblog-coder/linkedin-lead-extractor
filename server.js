const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 LinkedIn Lead Extractor v2.0 - Starting...');

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
  res.json({ status: 'healthy', version: '2.0.0' });
});

// Initialize queues
const { initializeQueues } = require('./utils/queue');

async function startServer() {
  try {
    // Initialize queues first
    await initializeQueues();
    console.log('✅ Queues initialized successfully');
    
    app.listen(PORT, () => {
      console.log('✅ LinkedIn Lead Extractor v2.0 running on port', PORT);
      console.log('🔄 Workers ready to process leads...');
    });
    
  } catch (error) {
    console.error('❌ Server startup error:', error);
    process.exit(1);
  }
}

startServer();