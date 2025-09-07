// test-domain-finding.js - Create this file for testing
const axios = require('axios');

const API_BASE_URL = 'https://linkedin-lead-extractor-production.up.railway.app/api';

async function testDomainFinding() {
  try {
    console.log('🧪 Testing domain finding system...');
    
    // 1. Check queue status
    console.log('\n1. Checking queue status...');
    const queueResponse = await axios.get(`${API_BASE_URL}/extraction/queue-status`);
    console.log('Queue Status:', JSON.stringify(queueResponse.data, null, 2));
    
    // 2. Test manual domain finding trigger
    console.log('\n2. Testing manual domain finding...');
    const testResponse = await axios.post(`${API_BASE_URL}/extraction/trigger-domain-finding`, {
      leadId: 'test-lead-id',
      company: 'Microsoft'
    });
    console.log('Manual Trigger Response:', JSON.stringify(testResponse.data, null, 2));
    
    // 3. Check queue status again
    console.log('\n3. Checking queue status after trigger...');
    setTimeout(async () => {
      const queueResponse2 = await axios.get(`${API_BASE_URL}/extraction/queue-status`);
      console.log('Updated Queue Status:', JSON.stringify(queueResponse2.data, null, 2));
    }, 2000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testDomainFinding();