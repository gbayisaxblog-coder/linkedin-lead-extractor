const API_BASE_URL = 'https://linkedin-lead-extractor-production.up.railway.app/api';

let currentFileId = null;
let files = [];

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Popup script loaded');
  await loadFiles();
  setupEventListeners();
});

function setupEventListeners() {
  const fileSelect = document.getElementById('fileSelect');
  const newFileNameInput = document.getElementById('newFileName');
  const createFileBtn = document.getElementById('createFileBtn');
  const extractBtn = document.getElementById('extractBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  
  if (extractBtn) {
    extractBtn.addEventListener('click', extractLinkedInData);
    console.log('✅ Extract button listener added');
  } else {
    console.error('❌ Extract button not found!');
  }
  
  if (fileSelect) fileSelect.addEventListener('change', onFileSelect);
  if (createFileBtn) createFileBtn.addEventListener('click', createNewFile);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadCSV);
}

async function loadFiles() {
  try {
    const response = await fetch(`${API_BASE_URL}/files`);
    if (!response.ok) throw new Error(`Failed to load files: ${response.status}`);
    
    files = await response.json();
    
    const fileSelect = document.getElementById('fileSelect');
    if (fileSelect) {
      fileSelect.innerHTML = '<option value="">-- Select File --</option>';
      files.forEach(file => {
        const option = document.createElement('option');
        option.value = file.id;
        option.textContent = file.name;
        fileSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('❌ Load files error:', error);
    showError('Failed to load files: ' + error.message);
  }
}

async function onFileSelect() {
  const fileSelect = document.getElementById('fileSelect');
  const fileId = fileSelect?.value;
  
  if (fileId) {
    currentFileId = fileId;
    const file = files.find(f => f.id === fileId);
    const currentFileSpan = document.getElementById('currentFile');
    const extractBtn = document.getElementById('extractBtn');
    
    if (currentFileSpan) currentFileSpan.textContent = file.name;
    if (extractBtn) extractBtn.disabled = false;
    
    console.log(`✅ File selected: ${file.name}`);
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
  }
}

async function createNewFile() {
  const newFileNameInput = document.getElementById('newFileName');
  const fileName = newFileNameInput?.value.trim();
  
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
    showSuccess(`File "${fileName}" created successfully!`);
  } catch (error) {
    console.error('❌ Create file error:', error);
    showError('Failed to create file: ' + error.message);
  }
}

async function extractLinkedInData() {
  console.log('🚀 EXTRACT BUTTON CLICKED - FUNCTION CALLED');
  
  if (!currentFileId) {
    console.error('❌ No file selected');
    showError('Please select a file first');
    return;
  }
  
  try {
    const pageSelect = document.getElementById('pageSelect');
    const maxPages = parseInt(pageSelect?.value) || 1;
    
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.textContent = `⏳ Extracting ${maxPages} pages...`;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to a LinkedIn search results page first');
    }
    
    console.log('📋 Extracting from LinkedIn...');
    showSuccess('Extracting from LinkedIn...');
    
    // Inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      console.log('Content script injection:', e);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📨 Sending message to content script...');
    
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Content script timeout'));
      }, 180000);
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'extractLeads',
        maxPages: maxPages,
        apiBaseUrl: API_BASE_URL
      }, (response) => {
        clearTimeout(timeout);
        
        console.log('📨 POPUP RECEIVED RESPONSE:', response);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Extraction failed'));
        }
      });
    });
    
    console.log(`✅ Got ${results.leads?.length || 0} leads from content script`);
    
    if (!results.leads || results.leads.length === 0) {
      showSuccess('No new leads found!');
      return;
    }
    
    // Send to backend
    console.log(`📤 Sending ${results.leads.length} leads to backend...`);
    showSuccess(`Sending ${results.leads.length} leads to database...`);
    
    const fileSelect = document.getElementById('fileSelect');
    const fileName = fileSelect?.options[fileSelect.selectedIndex]?.text || 'Unknown';
    
    const requestPayload = {
      leads: results.leads,
      fileId: currentFileId,
      fileName: fileName,
      userId: 'chrome_extension_user'
    };
    
    console.log('📦 Sending payload:', {
      leadsCount: requestPayload.leads.length,
      fileId: requestPayload.fileId,
      fileName: requestPayload.fileName
    });
    
    const response = await fetch(`${API_BASE_URL}/extraction/extract`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });
    
    console.log(`📡 Backend response: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Backend success:', result);
    
    showSuccess(`✅ ${result.insertedCount} leads saved to database!`);
    
    // Start polling for updates
    startPolling();
    
  } catch (error) {
    console.error('❌ Extraction error:', error);
    showError(`Extraction failed: ${error.message}`);
  } finally {
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = false;
      extractBtn.textContent = '🚀 Extract LinkedIn Data';
    }
  }
}

async function downloadCSV() {
  if (!currentFileId) {
    showError('Please select a file first');
    return;
  }
  
  try {
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = '⏳ Preparing...';
    }
    
    const response = await fetch(`${API_BASE_URL}/export/csv/${currentFileId}`);
    
    if (!response.ok) throw new Error('Failed to generate CSV');
    
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
    
    showSuccess('CSV downloaded successfully!');
    
  } catch (error) {
    showError('Download failed: ' + error.message);
  } finally {
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '📥 Download CSV';
    }
  }
}

function showError(message) {
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = message;
    messagesDiv.appendChild(div);
    setTimeout(() => div.remove(), 10000);
  }
}

function showSuccess(message) {
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    const div = document.createElement('div');
    div.className = 'success';
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

async function updateFileStats(fileId) {
  try {
    const stats = await getFileStats(fileId);
    if (stats) {
      const totalLeadsSpan = document.getElementById('totalLeads');
      const completedLeadsSpan = document.getElementById('completedLeads');
      const ceoLeadsSpan = document.getElementById('ceoLeads');
      const downloadBtn = document.getElementById('downloadBtn');
      
      if (totalLeadsSpan) totalLeadsSpan.textContent = stats.current_total || 0;
      if (completedLeadsSpan) completedLeadsSpan.textContent = stats.completed || 0;
      if (ceoLeadsSpan) ceoLeadsSpan.textContent = stats.with_ceo || 0;
      if (downloadBtn) downloadBtn.disabled = stats.completed === 0;
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

let pollingInterval = null;

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(async () => {
    if (currentFileId) {
      await updateFileStats(currentFileId);
    }
  }, 5000);
}