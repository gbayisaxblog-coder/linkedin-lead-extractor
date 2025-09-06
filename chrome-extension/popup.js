// IMPORTANT: UPDATE THIS URL AFTER DEPLOYING TO RAILWAY
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
    console.log('🔄 Loading files from API...');
    const response = await fetch(`${API_BASE_URL}/files`);
    if (!response.ok) throw new Error(`Failed to load files: ${response.status}`);
    
    files = await response.json();
    console.log('✅ Files loaded:', files);
    
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
    console.log(`🔄 Creating file: ${fileName}`);
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
  
  console.log('=== STARTING EXTRACTION ===');
  console.log('Current file ID:', currentFileId);
  console.log('API Base URL:', API_BASE_URL);
  
  try {
    const pageSelect = document.getElementById('pageSelect');
    const maxPages = parseInt(pageSelect.value) || 1;
    
    extractBtn.disabled = true;
    extractBtn.textContent = `⏳ Extracting ${maxPages} pages...`;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab URL:', tab.url);
    
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to a LinkedIn search results page first');
    }
    
    // STEP 1: Test API Connection
    console.log('🔗 Step 1: Testing API connection...');
    showSuccess('Step 1: Testing API connection...');
    
    const healthUrl = `${API_BASE_URL.replace('/api', '')}/health`;
    console.log('Health check URL:', healthUrl);
    
    const healthResponse = await fetch(healthUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!healthResponse.ok) {
      throw new Error(`API not reachable (${healthResponse.status})`);
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ API connection successful:', healthData);
    
    // STEP 2: Extract from LinkedIn
    console.log('📋 Step 2: Extracting from LinkedIn...');
    showSuccess('Step 2: Extracting from LinkedIn...');
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('✅ Content script injected');
    } catch (e) {
      console.log('Content script injection result:', e);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('LinkedIn extraction timeout - no response from content script'));
      }, 180000); // 3 minute timeout
      
      console.log('📨 Sending message to content script...');
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'extractLeads',
        maxPages: maxPages,
        apiBaseUrl: API_BASE_URL
      }, (response) => {
        clearTimeout(timeout);
        
        console.log('📨 Content script response:', response);
        
        if (chrome.runtime.lastError) {
          console.error('❌ Runtime error:', chrome.runtime.lastError);
          reject(new Error(`Content script error: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'LinkedIn extraction failed'));
        }
      });
    });
    
    console.log('✅ LinkedIn extraction successful:', results);
    console.log('Extracted leads sample:', results.leads.slice(0, 3));
    
    if (!results.leads || results.leads.length === 0) {
      showSuccess('No new leads found - all profiles already in database!');
      return;
    }
    
    // STEP 3: Send to Database
    console.log(`📤 Step 3: Sending ${results.leads.length} leads to database...`);
    showSuccess(`Step 3: Sending ${results.leads.length} leads to database...`);
    
    const requestBody = {
      leads: results.leads,
      fileId: currentFileId,
      fileName: fileSelect.options[fileSelect.selectedIndex].text,
      userId: 'chrome_extension_user'
    };
    
    console.log('📦 Request payload preview:', {
      leadsCount: requestBody.leads.length,
      fileId: requestBody.fileId,
      fileName: requestBody.fileName,
      sampleLead: requestBody.leads[0]
    });
    
    const extractUrl = `${API_BASE_URL}/extraction/extract`;
    console.log('Extract URL:', extractUrl);
    
    const response = await fetch(extractUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log(`📡 Response status: ${response.status}`);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Server error response:', errorText);
      throw new Error(`Database save failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Database save successful:', result);
    
    // STEP 4: Verify Database Save
    console.log('🔍 Step 4: Verifying database save...');
    showSuccess('Step 4: Verifying database save...');
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    const verifyResponse = await fetch(`${API_BASE_URL}/extraction/status/${currentFileId}`);
    if (verifyResponse.ok) {
      const stats = await verifyResponse.json();
      console.log('✅ Database verification:', stats);
      
      if (stats.current_total > 0) {
        showSuccess(`✅ SUCCESS! ${result.insertedCount} leads saved to database. ${stats.current_total} total in file. Processing started...`);
      } else {
        showError('⚠️ Leads not found in database after save attempt');
      }
    } else {
      console.error('❌ Verification failed:', verifyResponse.status);
    }
    
    startPolling();
    
  } catch (error) {
    console.error('❌ Complete error details:', error);
    showError(`Extraction failed: ${error.message}`);
    
    // Additional debugging info
    console.log('🔍 Debug info:');
    console.log('- Current file ID:', currentFileId);
    console.log('- API Base URL:', API_BASE_URL);
    console.log('- Tab URL:', tab?.url);
    
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
  setTimeout(() => div.remove(), 8000);
}

function showSuccess(message) {
  const div = document.createElement('div');
  div.className = 'success';
  div.textContent = message;
  messagesDiv.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

function clearStats() {
  totalLeadsSpan.textContent = '0';
  completedLeadsSpan.textContent = '0';
  ceoLeadsSpan.textContent = '0';
}