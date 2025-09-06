const API_BASE_URL = 'https://linkedin-lead-extractor-production.up.railway.app/api';

let currentFileId = null;
let files = [];

// DOM elements
const fileSelect = document.getElementById('fileSelect');
const newFileNameInput = document.getElementById('newFileName');
const createFileBtn = document.getElementById('createFileBtn');
const extractBtn = document.getElementById('extractBtn');
const downloadBtn = document.getElementById('downloadBtn');
const messagesDiv = document.getElementById('messages');

// Stats elements
const currentFileSpan = document.getElementById('currentFile');
const totalLeadsSpan = document.getElementById('totalLeads');
const completedLeadsSpan = document.getElementById('completedLeads');
const ceoLeadsSpan = document.getElementById('ceoLeads');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadFiles();
  setupEventListeners();
});

function setupEventListeners() {
  fileSelect.addEventListener('change', onFileSelect);
  createFileBtn.addEventListener('click', createNewFile);
  extractBtn.addEventListener('click', extractLinkedInData);
  downloadBtn.addEventListener('click', downloadCSV);
}

async function loadFiles() {
  try {
    const response = await fetch(`${API_BASE_URL}/files`);
    if (!response.ok) throw new Error(`Failed to load files: ${response.status}`);
    
    files = await response.json();
    
    fileSelect.innerHTML = '<option value="">-- Select File --</option>';
    files.forEach(file => {
      const option = document.createElement('option');
      option.value = file.id;
      option.textContent = file.name;
      fileSelect.appendChild(option);
    });
  } catch (error) {
    console.error('❌ Load files error:', error);
    showError('Failed to load files: ' + error.message);
  }
}

async function onFileSelect() {
  const fileId = fileSelect.value;
  
  if (fileId) {
    currentFileId = fileId;
    const file = files.find(f => f.id === fileId);
    currentFileSpan.textContent = file.name;
    extractBtn.disabled = false;
    
    await updateFileStats(fileId);
  } else {
    currentFileId = null;
    currentFileSpan.textContent = 'None';
    extractBtn.disabled = true;
    downloadBtn.disabled = true;
    clearStats();
  }
}

async function createNewFile() {
  const fileName = newFileNameInput.value.trim();
  
  if (!fileName) {
    showError('Please enter a file name');
    return;
  }
  
  try {
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
    files.unshift(newFile);
    
    const option = document.createElement('option');
    option.value = newFile.id;
    option.textContent = newFile.name;
    fileSelect.insertBefore(option, fileSelect.children[1]);
    
    fileSelect.value = newFile.id;
    await onFileSelect();
    
    newFileNameInput.value = '';
    showSuccess(`File "${fileName}" created successfully!`);
  } catch (error) {
    console.error('❌ Create file error:', error);
    showError('Failed to create file: ' + error.message);
  }
}

async function extractLinkedInData() {
  if (!currentFileId) {
    showError('Please select a file first');
    return;
  }
  
  console.log('=== STARTING BULLETPROOF EXTRACTION ===');
  console.log('Current file ID:', currentFileId);
  console.log('API Base URL:', API_BASE_URL);
  
  try {
    const pageSelect = document.getElementById('pageSelect');
    const maxPages = parseInt(pageSelect.value) || 1;
    
    extractBtn.disabled = true;
    extractBtn.textContent = `⏳ Extracting ${maxPages} pages...`;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to a LinkedIn search results page first');
    }
    
    // STEP 1: Test API Connection
    console.log('🔗 Step 1: Testing API connection...');
    showSuccess('Step 1: Testing API connection...');
    
    const healthResponse = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
    if (!healthResponse.ok) {
      throw new Error(`API not reachable (${healthResponse.status})`);
    }
    console.log('✅ API connection successful');
    
    // STEP 2: Get Initial Database Count
    console.log('📊 Step 2: Getting initial database count...');
    const initialStats = await getFileStats(currentFileId);
    const initialCount = initialStats?.current_total || 0;
    console.log(`📊 Initial lead count in database: ${initialCount}`);
    
    // STEP 3: Extract from LinkedIn
    console.log('📋 Step 3: Extracting from LinkedIn...');
    showSuccess('Step 3: Extracting from LinkedIn...');
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      console.log('Content script injection result:', e);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Content script timeout'));
      }, 300000);
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'extractLeads',
        maxPages: maxPages,
        apiBaseUrl: API_BASE_URL
      }, (response) => {
        clearTimeout(timeout);
        
        console.log('📨 Content script response received');
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'LinkedIn extraction failed'));
        }
      });
    });
    
    console.log(`✅ LinkedIn extraction successful: ${results.leads?.length || 0} leads`);
    
    if (!results.leads || results.leads.length === 0) {
      showSuccess('No new leads found - all profiles already in database!');
      return;
    }
    
    // STEP 4: Send to Database with Verification
    console.log(`📤 Step 4: Sending ${results.leads.length} leads to database...`);
    showSuccess(`Step 4: Sending ${results.leads.length} leads to database...`);
    
    const requestPayload = {
      leads: results.leads,
      fileId: currentFileId,
      fileName: fileSelect.options[fileSelect.selectedIndex].text,
      userId: 'chrome_extension_user'
    };
    
    console.log(`📦 Payload: ${requestPayload.leads.length} leads for file ${requestPayload.fileId}`);
    
    const response = await fetch(`${API_BASE_URL}/extraction/extract`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });
    
    console.log(`📡 Backend response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend error:', errorText);
      throw new Error(`Backend error (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Backend response:', result);
    
    // STEP 5: VERIFY DATABASE SAVE (CRITICAL)
    console.log('🔍 Step 5: VERIFYING database save...');
    showSuccess('Step 5: Verifying database save...');
    
    // Wait for database to update
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check database count multiple times to ensure consistency
    let verificationAttempts = 0;
    let verifiedCount = 0;
    const maxVerificationAttempts = 5;
    
    while (verificationAttempts < maxVerificationAttempts) {
      try {
        const verifyStats = await getFileStats(currentFileId);
        const currentCount = verifyStats?.current_total || 0;
        const expectedCount = initialCount + result.insertedCount;
        
        console.log(`🔍 Verification attempt ${verificationAttempts + 1}:`);
        console.log(`   Initial count: ${initialCount}`);
        console.log(`   Backend reported inserted: ${result.insertedCount}`);
        console.log(`   Expected total: ${expectedCount}`);
        console.log(`   Actual count in database: ${currentCount}`);
        
        if (currentCount >= expectedCount) {
          verifiedCount = currentCount;
          console.log(`✅ DATABASE VERIFICATION SUCCESSFUL!`);
          break;
        } else {
          console.log(`⚠️ Count mismatch - waiting and retrying...`);
          verificationAttempts++;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (verifyError) {
        console.error(`❌ Verification attempt ${verificationAttempts + 1} failed:`, verifyError);
        verificationAttempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // STEP 6: Report Final Results
    if (verifiedCount > initialCount) {
      const actualInserted = verifiedCount - initialCount;
      showSuccess(`✅ SUCCESS! ${actualInserted} leads verified in database. Processing started...`);
      console.log(`✅ FINAL VERIFICATION: ${actualInserted} leads successfully added to database`);
    } else {
      const errorMsg = `❌ DATABASE VERIFICATION FAILED! Expected ${result.insertedCount} leads but only found ${verifiedCount - initialCount} new leads in database.`;
      console.error(errorMsg);
      showError(errorMsg);
      
      // Additional debugging
      console.log('🔍 DEBUGGING INFO:');
      console.log('- Backend claimed to insert:', result.insertedCount);
      console.log('- Database initial count:', initialCount);
      console.log('- Database current count:', verifiedCount);
      console.log('- Actual new leads in DB:', verifiedCount - initialCount);
      console.log('- Missing leads:', result.insertedCount - (verifiedCount - initialCount));
      
      // Still start polling in case some leads made it through
    }
    
    startPolling();
    
  } catch (error) {
    console.error('❌ COMPLETE EXTRACTION ERROR:', error);
    showError(`Extraction failed: ${error.message}`);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = '🚀 Extract LinkedIn Data';
  }
}

async function downloadCSV() {
  if (!currentFileId) {
    showError('Please select a file first');
    return;
  }
  
  try {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '⏳ Preparing...';
    
    const response = await fetch(`${API_BASE_URL}/export/csv/${currentFileId}`);
    
    if (!response.ok) throw new Error('Failed to generate CSV');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFileSpan.textContent}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showSuccess('CSV downloaded successfully!');
    
  } catch (error) {
    showError('Download failed: ' + error.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = '📥 Download CSV';
  }
}

let pollingInterval = null;

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(async () => {
    if (currentFileId) {
      await updateFileStats(currentFileId);
    }
  }, 5000);
}

async function updateFileStats(fileId) {
  try {
    const stats = await getFileStats(fileId);
    if (stats) {
      totalLeadsSpan.textContent = stats.current_total || 0;
      completedLeadsSpan.textContent = stats.completed || 0;
      ceoLeadsSpan.textContent = stats.with_ceo || 0;
      
      downloadBtn.disabled = stats.completed === 0;
    }
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

async function getFileStats(fileId) {
  try {
    const response = await fetch(`${API_BASE_URL}/extraction/status/${fileId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

function showError(message) {
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = message;
  messagesDiv.appendChild(div);
  setTimeout(() => div.remove(), 10000);
}

function showSuccess(message) {
  const div = document.createElement('div');
  div.className = 'success';
  div.textContent = message;
  messagesDiv.appendChild(div);
  setTimeout(() => div.remove(), 8000);
}

function clearStats() {
  totalLeadsSpan.textContent = '0';
  completedLeadsSpan.textContent = '0';
  ceoLeadsSpan.textContent = '0';
}