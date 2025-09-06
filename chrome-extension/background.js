console.log('🚀 LinkedIn Lead Extractor background script loaded');

const API_BASE_URL = 'https://linkedin-lead-extractor-production.up.railway.app/api';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request);
  
  if (request.action === 'loadFiles') {
    loadFiles().then(sendResponse);
    return true; // Keep channel open
  }
  
  if (request.action === 'createFile') {
    createFile(request.fileName).then(sendResponse);
    return true;
  }
  
  if (request.action === 'sendToDatabase') {
    sendToDatabase(request.payload).then(sendResponse);
    return true;
  }
  
  if (request.action === 'getFileStats') {
    getFileStats(request.fileId).then(sendResponse);
    return true;
  }
  
  if (request.action === 'downloadCSV') {
    downloadCSV(request.fileId).then(sendResponse);
    return true;
  }
});

async function loadFiles() {
  try {
    console.log('📂 Loading files from API...');
    const response = await fetch(`${API_BASE_URL}/files`);
    
    if (!response.ok) {
      throw new Error(`Failed to load files: ${response.status}`);
    }
    
    const files = await response.json();
    console.log('✅ Files loaded:', files);
    
    return { success: true, files };
  } catch (error) {
    console.error('❌ Load files error:', error);
    return { success: false, error: error.message };
  }
}

async function createFile(fileName) {
  try {
    console.log('📁 Creating file:', fileName);
    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create file: ${errorText}`);
    }
    
    const newFile = await response.json();
    console.log('✅ File created:', newFile);
    
    return { success: true, file: newFile };
  } catch (error) {
    console.error('❌ Create file error:', error);
    return { success: false, error: error.message };
  }
}

async function sendToDatabase(payload) {
  try {
    console.log('📤 Sending to database:', {
      leadsCount: payload.leads.length,
      fileId: payload.fileId,
      fileName: payload.fileName
    });
    
    const response = await fetch(`${API_BASE_URL}/extraction/extract`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`📡 Database response: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Database error: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Database success:', result);
    
    return { success: true, result };
  } catch (error) {
    console.error('❌ Database error:', error);
    return { success: false, error: error.message };
  }
}

async function getFileStats(fileId) {
  try {
    const response = await fetch(`${API_BASE_URL}/extraction/status/${fileId}`);
    
    if (!response.ok) {
      return { success: false, error: 'Failed to get stats' };
    }
    
    const stats = await response.json();
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function downloadCSV(fileId) {
  try {
    const response = await fetch(`${API_BASE_URL}/export/csv/${fileId}`);
    
    if (!response.ok) {
      throw new Error('Failed to generate CSV');
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}