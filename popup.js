console.log('🚀 [POPUP] LinkedIn Lead Extractor popup script loaded - FULL DEBUG MODE');
console.log('🚀 [POPUP] Timestamp:', new Date().toISOString());

const API_BASE_URL = 'https://linkedin-lead-extractor-production.up.railway.app/api';

let currentFileId = null;
let files = [];

// Debug function to log everything
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`🔧 [POPUP ${timestamp}] ${message}`, data || '');
}

document.addEventListener('DOMContentLoaded', async () => {
  debugLog('📋 DOM Content Loaded, initializing...');
  await loadFiles();
  setupEventListeners();
  debugLog('✅ Popup initialization complete');
});

function setupEventListeners() {
  debugLog('🔗 Setting up event listeners...');
  
  const fileSelect = document.getElementById('fileSelect');
  const newFileNameInput = document.getElementById('newFileName');
  const createFileBtn = document.getElementById('createFileBtn');
  const extractBtn = document.getElementById('extractBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const debugBtn = document.getElementById('debugBtn');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  
  if (extractBtn) {
    extractBtn.addEventListener('click', extractLinkedInData);
    debugLog('✅ Extract button listener added');
  }
  
  if (fileSelect) {
    fileSelect.addEventListener('change', onFileSelect);
    debugLog('✅ File select listener added');
  }
  
  if (createFileBtn) {
    createFileBtn.addEventListener('click', createNewFile);
    debugLog('✅ Create file button listener added');
  }
  
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadCSV);
    debugLog('✅ Download button listener added');
  }
  
  if (debugBtn) {
    debugBtn.addEventListener('click', runFullDebugTest);
    debugLog('✅ Debug button listener added');
  }
  
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      console.clear();
      debugLog('🗑️ Console cleared');
    });
    debugLog('✅ Clear logs button listener added');
  }
  
  debugLog('✅ All event listeners set up successfully');
}

async function loadFiles() {
  try {
    debugLog('📂 Starting loadFiles...');
    
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('loadFiles timeout'));
      }, 10000);
      
      chrome.runtime.sendMessage({ action: 'loadFiles' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          debugLog('❌ Chrome runtime error in loadFiles:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    debugLog('📡 loadFiles response received:', response);
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'loadFiles failed');
    }
    
    files = response.files;
    debugLog('✅ Files loaded successfully:', { count: files.length, files });
    
    const fileSelect = document.getElementById('fileSelect');
    if (fileSelect) {
      fileSelect.innerHTML = '<option value="">-- Select File --</option>';
      files.forEach(file => {
        const option = document.createElement('option');
        option.value = file.id;
        option.textContent = file.name;
        fileSelect.appendChild(option);
      });
      debugLog('✅ File select populated with options');
    }
  } catch (error) {
    debugLog('❌ loadFiles failed:', { message: error.message, stack: error.stack });
    showError('Failed to load files: ' + error.message);
  }
}

async function runFullDebugTest() {
  debugLog('🧪 Starting full debug test suite...');
  showDebug('Starting comprehensive debug tests...');
  
  // Test 1: Background communication
  try {
    debugLog('🧪 Test 1: Testing background communication...');
    const response1 = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test 1 timeout')), 5000);
      chrome.runtime.sendMessage({ action: 'loadFiles' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    debugLog('✅ Test 1 passed:', response1);
    showSuccess('✅ Test 1: Background communication works');
  } catch (error) {
    debugLog('❌ Test 1 failed:', error);
    showError('❌ Test 1 failed: ' + error.message);
    return;
  }
  
  // Test 2: File creation
  let testFileId;
  try {
    debugLog('🧪 Test 2: Testing file creation...');
    const fileName = `debug_test_${Date.now()}`;
    const response2 = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test 2 timeout')), 10000);
      chrome.runtime.sendMessage({ 
        action: 'createFile', 
        fileName: fileName 
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    debugLog('✅ Test 2 passed:', response2);
    
    if (response2.success) {
      testFileId = response2.file.id;
      showSuccess(`✅ Test 2: File created successfully (ID: ${testFileId})`);
    } else {
      throw new Error(response2.error);
    }
  } catch (error) {
    debugLog('❌ Test 2 failed:', error);
    showError('❌ Test 2 failed: ' + error.message);
    return;
  }
  
  // Test 3: Database send
  try {
    debugLog('🧪 Test 3: Testing database send...');
    const testLeads = [{
      fullName: 'DebugTest Person',
      company: 'Debug Test Company',
      extractedAt: new Date().toISOString()
    }];
    
    const response3 = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test 3 timeout')), 15000);
      chrome.runtime.sendMessage({ 
        action: 'sendToDatabase', 
        payload: {
          leads: testLeads,
          fileId: testFileId,
          fileName: 'debug_test',
          userId: 'debug_user'
        }
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    debugLog('✅ Test 3 passed:', response3);
    
    if (response3.success) {
      showSuccess(`✅ Test 3: Database send successful! Inserted: ${response3.result.insertedCount}`);
      
      // Test 4: Verify data in database
      setTimeout(async () => {
        try {
          debugLog('🧪 Test 4: Verifying database save...');
          const response4 = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Test 4 timeout')), 5000);
            chrome.runtime.sendMessage({ 
              action: 'getFileStats', 
              fileId: testFileId 
            }, (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
          
          debugLog('✅ Test 4 passed:', response4);
          
          if (response4.success && response4.stats.current_total > 0) {
            showSuccess(`🎉 ALL TESTS PASSED! Database has ${response4.stats.current_total} total leads`);
          } else {
            showError('⚠️ Test 4: Data not found in database stats');
          }
        } catch (error) {
          debugLog('❌ Test 4 failed:', error);
          showError('❌ Test 4 failed: ' + error.message);
        }
      }, 3000);
      
    } else {
      throw new Error(response3.error);
    }
  } catch (error) {
    debugLog('❌ Test 3 failed:', error);
    showError('❌ Test 3 failed: ' + error.message);
  }
}

async function onFileSelect() {
  const fileSelect = document.getElementById('fileSelect');
  const fileId = fileSelect?.value;
  
  debugLog('📁 File selection changed:', fileId);
  
  if (fileId) {
    currentFileId = fileId;
    const file = files.find(f => f.id === fileId);
    const currentFileSpan = document.getElementById('currentFile');
    const extractBtn = document.getElementById('extractBtn');
    
    if (currentFileSpan) currentFileSpan.textContent = file.name;
    if (extractBtn) extractBtn.disabled = false;
    
    debugLog('✅ File selected successfully:', { id: fileId, name: file.name });
    await updateFileStats(fileId);
  } else {
    currentFileId = null;
    const currentFileSpan = document.getElementById('currentFile');
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    
    if (currentFileSpan) currentFileSpan.textContent = 'None';
    if (extractBtn) extractBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    clearStats();
    debugLog('📁 File selection cleared');
  }
}

async function createNewFile() {
  const newFileNameInput = document.getElementById('newFileName');
  const fileName = newFileNameInput?.value.trim();
  
  debugLog('📁 Creating new file:', fileName);
  
  if (!fileName) {
    debugLog('❌ No file name provided');
    showError('Please enter a file name');
    return;
  }
  
  try {
    const uniqueFileName = `${fileName}_${Date.now()}`;
    debugLog('📁 Creating file with unique name:', uniqueFileName);
    
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Create file timeout')), 10000);
      chrome.runtime.sendMessage({ 
        action: 'createFile', 
        fileName: uniqueFileName 
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    debugLog('📡 Create file response:', response);
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Create file failed');
    }
    
    const newFile = response.file;
    files.unshift(newFile);
    
    const fileSelect = document.getElementById('fileSelect');
    if (fileSelect) {
      const option = document.createElement('option');
      option.value = newFile.id;
      option.textContent = newFile.name;
      fileSelect.insertBefore(option, fileSelect.children[1]);
      fileSelect.value = newFile.id;
    }
    
    await onFileSelect();
    
    if (newFileNameInput) newFileNameInput.value = '';
    debugLog('✅ File created successfully:', newFile);
    showSuccess(`File "${uniqueFileName}" created successfully!`);
  } catch (error) {
    debugLog('❌ Create file failed:', error);
    showError('Failed to create file: ' + error.message);
  }
}

async function extractLinkedInData() {
  debugLog('🚀 Extract button clicked - starting extraction process');
  
  if (!currentFileId) {
    debugLog('❌ No file selected for extraction');
    showError('Please select a file first');
    return;
  }
  
  try {
    const pageSelect = document.getElementById('pageSelect');
    const maxPages = parseInt(pageSelect?.value) || 1;
    const fileName = document.getElementById('currentFile')?.textContent || 'Unknown';
    
    debugLog('📊 Extraction parameters:', { maxPages, fileId: currentFileId, fileName });
    
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.textContent = `⏳ Extracting ${maxPages} pages...`;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    debugLog('🌐 Current tab:', { url: tab.url, id: tab.id });
    
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to LinkedIn Sales Navigator first');
    }
    
    debugLog('📋 Step 1: Testing API connection...');
    showSuccess('Step 1: Testing API connection...');
    
    // Test API connection
    const testResponse = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('API test timeout')), 5000);
      chrome.runtime.sendMessage({ action: 'loadFiles' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (!testResponse || !testResponse.success) {
      throw new Error('Cannot connect to backend API');
    }
    debugLog('✅ API connection test passed');
    
    debugLog('📋 Step 2: Injecting content script...');
    showSuccess('Step 2: Injecting extraction script...');
    
    // Inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      debugLog('✅ Content script injected successfully');
    } catch (e) {
      debugLog('⚠️ Content script injection (may already exist):', e.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    debugLog('📨 Step 3: Starting independent extraction...');
    showSuccess('Step 3: Starting LinkedIn extraction with independent database saving...');
    showSuccess(`The content script will extract and save leads across ${maxPages} pages`);
    showSuccess('You can close this popup - extraction will continue independently');
    
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Content script timeout - extraction took too long'));
      }, 1800000); // 30 minutes for large extractions
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'extractLeads',
        maxPages: maxPages,
        fileId: currentFileId,
        fileName: fileName
      }, (response) => {
        clearTimeout(timeout);
        
        debugLog('📨 Content script response received:', response);
        
        if (chrome.runtime.lastError) {
          debugLog('❌ Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Communication error: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        if (!response) {
          reject(new Error('No response from content script'));
          return;
        }
        
        if (response.success === false) {
          reject(new Error(response.error || 'Content script reported failure'));
          return;
        }
        
        if (response.success === true) {
          debugLog('✅ Content script extraction successful');
          resolve(response);
        } else {
          reject(new Error('Invalid response format from content script'));
        }
      });
    });
    
    debugLog('📊 Final extraction results:', {
      leadsCount: results.leadsCount || 0,
      savedToDatabase: results.savedToDatabase || 0,
      pagesProcessed: results.pagesProcessed || 0
    });
    
    showSuccess('Step 4: Extraction completed successfully!');
    
    if (results.savedToDatabase > 0) {
      showSuccess(`✅ SUCCESS! ${results.savedToDatabase} leads saved to database from ${results.pagesProcessed} pages!`);
      document.getElementById('totalLeads').textContent = results.savedToDatabase;
    } else if (results.leadsCount > 0) {
      showSuccess(`Extraction complete: ${results.leadsCount} leads processed from ${results.pagesProcessed} pages (may be duplicates)`);
      document.getElementById('totalLeads').textContent = results.leadsCount;
    } else {
      showSuccess('No new leads found on the specified pages');
    }
    
    // Update UI stats
    await updateFileStats(currentFileId);
    startPolling();
    
    // Enable download if we have leads
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn && (results.savedToDatabase > 0 || results.leadsCount > 0)) {
      downloadBtn.disabled = false;
    }
    
  } catch (error) {
    debugLog('❌ Extraction process failed:', { message: error.message, stack: error.stack });
    showError(`❌ EXTRACTION FAILED: ${error.message}`);
  } finally {
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = false;
      extractBtn.textContent = '🚀 Extract LinkedIn Data';
    }
  }
}

async function downloadCSV() {
  debugLog('📥 Download CSV requested');
  
  if (!currentFileId) {
    debugLog('❌ No file selected for download');
    showError('Please select a file first');
    return;
  }
  
  try {
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = '⏳ Preparing...';
    }
    
    // Direct download via Railway API (popup can access external URLs)
    const response = await fetch(`${API_BASE_URL}/export/csv/${currentFileId}`);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const currentFileSpan = document.getElementById('currentFile');
    a.download = `${currentFileSpan?.textContent || 'export'}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    debugLog('✅ CSV download completed');
    showSuccess('CSV downloaded successfully!');
  } catch (error) {
    debugLog('❌ CSV download failed:', error);
    showError('Download failed: ' + error.message);
  } finally {
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '📥 Download CSV';
    }
  }
}

async function updateFileStats(fileId) {
  try {
    debugLog('📊 Updating file stats for:', fileId);
    
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Stats timeout')), 5000);
      chrome.runtime.sendMessage({ 
        action: 'getFileStats', 
        fileId: fileId 
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (response && response.success) {
      const stats = response.stats;
      debugLog('📊 Stats updated:', stats);
      
      const totalLeadsSpan = document.getElementById('totalLeads');
      const completedLeadsSpan = document.getElementById('completedLeads');
      const ceoLeadsSpan = document.getElementById('ceoLeads');
      const downloadBtn = document.getElementById('downloadBtn');
      
      if (totalLeadsSpan) totalLeadsSpan.textContent = stats.current_total || 0;
      if (completedLeadsSpan) completedLeadsSpan.textContent = stats.completed || 0;
      if (ceoLeadsSpan) ceoLeadsSpan.textContent = stats.with_ceo || 0;
      if (downloadBtn) downloadBtn.disabled = (stats.current_total || 0) === 0;
    }
  } catch (error) {
    debugLog('❌ Failed to update stats:', error);
  }
}

function showError(message) {
  debugLog('🚨 Showing error message:', message);
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = message;
    messagesDiv.appendChild(div);
    setTimeout(() => div.remove(), 15000);
  }
}

function showSuccess(message) {
  debugLog('✅ Showing success message:', message);
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    const div = document.createElement('div');
    div.className = 'success';
    div.textContent = message;
    messagesDiv.appendChild(div);
    setTimeout(() => div.remove(), 10000);
  }
}

function showDebug(message) {
  debugLog('🔧 Showing debug message:', message);
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    const div = document.createElement('div');
    div.className = 'debug';
    div.textContent = message;
    messagesDiv.appendChild(div);
    setTimeout(() => div.remove(), 8000);
  }
}

function clearStats() {
  const totalLeadsSpan = document.getElementById('totalLeads');
  const completedLeadsSpan = document.getElementById('completedLeads');
  const ceoLeadsSpan = document.getElementById('ceoLeads');
  
  if (totalLeadsSpan) totalLeadsSpan.textContent = '0';
  if (completedLeadsSpan) completedLeadsSpan.textContent = '0';
  if (ceoLeadsSpan) ceoLeadsSpan.textContent = '0';
}

let pollingInterval = null;

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  debugLog('🔄 Starting stats polling...');
  pollingInterval = setInterval(async () => {
    if (currentFileId) {
      await updateFileStats(currentFileId);
    }
  }, 5000);
}

debugLog('✅ Popup script initialization complete');