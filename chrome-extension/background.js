console.log('🚀 [BACKGROUND] LinkedIn Lead Extractor background script loaded - FULL DEBUG MODE');
console.log('🚀 [BACKGROUND] Timestamp:', new Date().toISOString());

const API_BASE_URL = 'https://linkedin-lead-extractor-production.up.railway.app/api';

// Debug function to log everything
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`🔧 [BACKGROUND ${timestamp}] ${message}`, data || '');
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('📨 Message received:', { action: request.action, sender: sender.tab?.url || 'popup' });
  
  const startTime = Date.now();
  
  if (request.action === 'loadFiles') {
    debugLog('🔄 Processing loadFiles...');
    loadFiles()
      .then(response => {
        debugLog('✅ loadFiles completed:', { success: response.success, duration: Date.now() - startTime });
        sendResponse(response);
      })
      .catch(error => {
        debugLog('❌ loadFiles failed:', { error: error.message, duration: Date.now() - startTime });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'createFile') {
    debugLog('🔄 Processing createFile:', request.fileName);
    createFile(request.fileName)
      .then(response => {
        debugLog('✅ createFile completed:', { success: response.success, duration: Date.now() - startTime });
        sendResponse(response);
      })
      .catch(error => {
        debugLog('❌ createFile failed:', { error: error.message, duration: Date.now() - startTime });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'sendToDatabase') {
    debugLog('🔄 Processing sendToDatabase:', {
      leadsCount: request.payload?.leads?.length,
      fileId: request.payload?.fileId,
      fileName: request.payload?.fileName
    });
    sendToDatabase(request.payload)
      .then(response => {
        debugLog('✅ sendToDatabase completed:', { success: response.success, duration: Date.now() - startTime });
        sendResponse(response);
      })
      .catch(error => {
        debugLog('❌ sendToDatabase failed:', { error: error.message, duration: Date.now() - startTime });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'getFileStats') {
    debugLog('🔄 Processing getFileStats:', request.fileId);
    getFileStats(request.fileId)
      .then(response => {
        debugLog('✅ getFileStats completed:', { success: response.success, duration: Date.now() - startTime });
        sendResponse(response);
      })
      .catch(error => {
        debugLog('❌ getFileStats failed:', { error: error.message, duration: Date.now() - startTime });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'checkDuplicates') {
    debugLog('🔄 Processing checkDuplicates:', { leadsCount: request.leads?.length });
    checkDuplicates(request.leads)
      .then(response => {
        debugLog('✅ checkDuplicates completed:', { success: response.success, duration: Date.now() - startTime });
        sendResponse(response);
      })
      .catch(error => {
        debugLog('❌ checkDuplicates failed:', { error: error.message, duration: Date.now() - startTime });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  debugLog('⚠️ Unknown action received:', request.action);
  sendResponse({ success: false, error: 'Unknown action: ' + request.action });
});

async function loadFiles() {
  try {
    debugLog('📂 Making loadFiles API call to:', `${API_BASE_URL}/files`);
    
    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Debug-Source': 'chrome-extension-background'
      }
    });
    
    debugLog('📡 loadFiles API response:', { status: response.status, ok: response.ok });
    
    if (!response.ok) {
      const errorText = await response.text();
      debugLog('❌ loadFiles API error:', { status: response.status, error: errorText });
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    
    const files = await response.json();
    debugLog('✅ loadFiles success:', { filesCount: files.length, files: files });
    
    return { success: true, files };
  } catch (error) {
    debugLog('❌ loadFiles exception:', { message: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
}

async function createFile(fileName) {
  try {
    debugLog('📁 Making createFile API call:', fileName);
    
    const requestBody = { name: fileName };
    debugLog('📦 createFile request body:', requestBody);
    
    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Debug-Source': 'chrome-extension-background'
      },
      body: JSON.stringify(requestBody)
    });
    
    debugLog('📡 createFile API response:', { status: response.status, ok: response.ok });
    
    if (!response.ok) {
      const errorText = await response.text();
      debugLog('❌ createFile API error:', { status: response.status, error: errorText });
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    
    const newFile = await response.json();
    debugLog('✅ createFile success:', newFile);
    
    return { success: true, file: newFile };
  } catch (error) {
    debugLog('❌ createFile exception:', { message: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
}

async function sendToDatabase(payload) {
  try {
    debugLog('📤 Making sendToDatabase API call');
    debugLog('📦 Full payload details:', {
      leadsCount: payload?.leads?.length,
      fileId: payload?.fileId,
      fileName: payload?.fileName,
      userId: payload?.userId,
      firstLead: payload?.leads?.[0],
      payloadSize: JSON.stringify(payload).length
    });
    
    const response = await fetch(`${API_BASE_URL}/extraction/extract`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Debug-Source': 'chrome-extension-background',
        'X-Debug-Timestamp': new Date().toISOString()
      },
      body: JSON.stringify(payload)
    });
    
    debugLog('📡 sendToDatabase API response:', { 
      status: response.status, 
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      debugLog('❌ sendToDatabase API error:', { status: response.status, error: errorText });
      throw new Error(`Database API Error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    debugLog('✅ sendToDatabase success:', result);
    
    return { success: true, result };
  } catch (error) {
    debugLog('❌ sendToDatabase exception:', { message: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
}

async function getFileStats(fileId) {
  try {
    debugLog('📊 Making getFileStats API call:', fileId);
    
    const response = await fetch(`${API_BASE_URL}/extraction/status/${fileId}`, {
      method: 'GET',
      headers: { 
        'Cache-Control': 'no-cache',
        'X-Debug-Source': 'chrome-extension-background'
      }
    });
    
    debugLog('📡 getFileStats API response:', { status: response.status, ok: response.ok });
    
    if (!response.ok) {
      debugLog('❌ getFileStats API error:', response.status);
      return { success: false, error: `Stats API error: ${response.status}` };
    }
    
    const stats = await response.json();
    debugLog('✅ getFileStats success:', stats);
    
    return { success: true, stats };
  } catch (error) {
    debugLog('❌ getFileStats exception:', { message: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
}

async function checkDuplicates(leads) {
  try {
    debugLog('🔍 Making checkDuplicates API call:', { leadsCount: leads?.length });
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      debugLog('❌ Invalid leads data for duplicate check');
      return { success: false, error: 'Invalid leads data' };
    }
    
    const response = await fetch(`${API_BASE_URL}/extraction/check-duplicates`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Debug-Source': 'chrome-extension-background'
      },
      body: JSON.stringify({ leads })
    });
    
    debugLog('📡 checkDuplicates API response:', { status: response.status, ok: response.ok });
    
    if (!response.ok) {
      const errorText = await response.text();
      debugLog('❌ checkDuplicates API error:', { status: response.status, error: errorText });
      
      // Return all false (assume all new) if duplicate check fails
      return { 
        success: true, 
        duplicates: leads.map(() => false),
        error: `Duplicate check failed: ${response.status}`
      };
    }
    
    const result = await response.json();
    const duplicateCount = result.duplicates?.filter(d => d).length || 0;
    debugLog('✅ checkDuplicates success:', { 
      totalChecked: leads.length, 
      duplicatesFound: duplicateCount,
      duplicateResults: result.duplicates 
    });
    
    return { success: true, duplicates: result.duplicates };
  } catch (error) {
    debugLog('❌ checkDuplicates exception:', { message: error.message, stack: error.stack });
    
    // Return all false (assume all new) if duplicate check fails
    return { 
      success: true, 
      duplicates: leads?.map(() => false) || [],
      error: error.message
    };
  }
}

debugLog('✅ Background script setup complete - FULL DEBUG MODE ACTIVE');