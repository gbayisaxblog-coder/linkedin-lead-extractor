const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Simple LinkedIn Extractor v1.0 - Starting...');

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
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Simple startup - no queues needed
app.listen(PORT, () => {
  console.log('✅ Simple LinkedIn Extractor running on port', PORT);
  console.log('📄 Ready for fullname + company extraction only');
  console.log('🌐 API Health Check:', `http://localhost:${PORT}/api/health`);
});