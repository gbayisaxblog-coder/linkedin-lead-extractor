const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const extractionRoutes = require('./routes/extraction');
const filesRoutes = require('./routes/files');
const exportRoutes = require('./routes/export');

// Initialize queues
console.log('🔄 Initializing queues...');
const { domainQueue, emailQueue, ceoQueue } = require('./utils/queue');
console.log('✅ Queues initialized successfully');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/extraction', extractionRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/export', exportRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✅ LinkedIn Lead Extractor API running on port ${PORT}`);
  console.log(`🔄 Workers ready to process leads...`);
});