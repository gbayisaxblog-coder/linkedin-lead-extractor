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
    const response = await fetch(`${API_BASE_URL}/files`);
    if (!response.ok) throw new Error('Failed to load files');
    
    files = await response.json();
    
    fileSelect.innerHTML = '<option value="">-- Select File --</option>';
    files.forEach(file => {
      const option = document.createElement('option');
      option.value = file.id;
      option.textContent = file.name;
      fileSelect.appendChild(option);
    });
  } catch (error) {
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
    
    if (!response.ok) throw new Error('Failed to create file');
    
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
    showError('Failed to create file: ' + error.message);
  }
}

async function extractLinkedInData() {
  if (!currentFileId) {
    showError('Please select a file first');
    return;
  }
  
  try {
    const pageSelect = document.getElementById('pageSelect');
    const maxPages = parseInt(pageSelect.value) || 1;
    
    extractBtn.disabled = true;
    extractBtn.textContent = `⏳ Extracting ${maxPages} pages...`;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on a LinkedIn page
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to a LinkedIn search results page first');
    }
    
    showSuccess(`Starting extraction of ${maxPages} pages...`);
    
    // Inject content script if needed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      console.log('Content script already injected or injection failed:', e);
    }
    
    // Wait a moment for script to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to send message with timeout
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Extraction timeout - make sure you\'re on a LinkedIn search results page'));
      }, 60000); // 60 second timeout
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'extractLeads',
        maxPages: maxPages
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Unknown extraction error'));
        }
      });
    });
    
    if (!results.leads || results.leads.length === 0) {
      throw new Error('No leads found. Make sure you\'re on a LinkedIn search results page with visible profiles.');
    }
    
    console.log('Extracted leads:', results.leads);
    
    const response = await fetch(`${API_BASE_URL}/extraction/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leads: results.leads,
        fileId: currentFileId,
        fileName: fileSelect.options[fileSelect.selectedIndex].text,
        userId: 'chrome_extension_user'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${errorText}`);
    }
    
    const result = await response.json();
    showSuccess(`Successfully extracted ${result.insertedCount} leads from ${results.pagesProcessed || 1} pages! Processing started...`);
    
    startPolling();
    
  } catch (error) {
    console.error('Extraction error:', error);
    showError('Extraction failed: ' + error.message);
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
  setTimeout(() => div.remove(), 5000);
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