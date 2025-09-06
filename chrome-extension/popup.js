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
  }
  
  if (fileSelect) fileSelect.addEventListener('change', onFileSelect);
  if (createFileBtn) createFileBtn.addEventListener('click', createNewFile);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadCSV);
}

async function loadFiles() {
  try {
    console.log('📂 Loading files via background script...');
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'loadFiles' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to load files');
    }
    
    files = response.files;
    console.log('📂 Files loaded:', files);
    
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
    
    console.log(`✅ File selected: ${file.name} (ID: ${fileId})`);
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
    const uniqueFileName = `${fileName}_${Date.now()}`;
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'createFile', 
        fileName: uniqueFileName 
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to create file');
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
    showSuccess(`File "${uniqueFileName}" created successfully!`);
  } catch (error) {
    console.error('❌ Create file error:', error);
    showError('Failed to create file: ' + error.message);
  }
}

async function extractLinkedInData() {
  console.log('🚀 EXTRACT BUTTON CLICKED - STARTING EXTRACTION');
  
  if (!currentFileId) {
    console.error('❌ No file selected');
    showError('Please select a file first');
    return;
  }
  
  try {
    const pageSelect = document.getElementById('pageSelect');
    const maxPages = parseInt(pageSelect?.value) || 1;
    console.log(`📊 Extracting ${maxPages} pages`);
    
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.textContent = `⏳ Extracting ${maxPages} pages...`;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('🌐 Current tab:', tab.url);
    
    if (!tab.url.includes('linkedin.com')) {
      throw new Error('Please navigate to LinkedIn Sales Navigator first');
    }
    
    console.log('📋 Step 1: Testing API connection...');
    showSuccess('Step 1: Testing API connection...');
    
    // Test API connection via background script
    const testResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'loadFiles' }, (response) => {
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
    console.log('✅ API connection OK');
    
    console.log('📋 Step 2: Injecting content script...');
    showSuccess('Step 2: Extracting from LinkedIn...');
    
    // Inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('✅ Content script injected');
    } catch (e) {
      console.log('Content script injection (may already exist):', e);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📨 Step 3: Communicating with content script...');
    showSuccess('Step 3: Extracting leads from LinkedIn page...');
    
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Content script timeout - extraction took too long'));
      }, 300000); // 5 minutes
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'extractLeads',
        maxPages: maxPages,
        apiBaseUrl: API_BASE_URL
      }, (response) => {
        clearTimeout(timeout);
        
        console.log('📨 RAW RESPONSE FROM CONTENT SCRIPT:', response);
        
        if (chrome.runtime.lastError) {
          console.error('❌ Chrome runtime error:', chrome.runtime.lastError);
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
          console.log('✅ Content script success!');
          console.log('📊 Leads received:', response.leadsCount || 0);
          resolve(response);
        } else {
          reject(new Error('Invalid response format from content script'));
        }
      });
    });
    
    console.log(`✅ Content script returned: ${results.leadsCount || results.leads?.length || 0} leads`);
    console.log('📋 Sample lead:', results.leads?.[0]);
    
    if (!results.leads || results.leads.length === 0) {
      showSuccess('No new leads found on this page!');
      return;
    }
    
    console.log('📋 Step 4: Sending to database via background script...');
    showSuccess(`Step 4: Sending ${results.leads.length} leads to database...`);
    
    const fileSelect = document.getElementById('fileSelect');
    const fileName = fileSelect?.options[fileSelect.selectedIndex]?.text || 'Unknown';
    
    const requestPayload = {
      leads: results.leads,
      fileId: currentFileId,
      fileName: fileName,
      userId: 'chrome_extension_user'
    };
    
    console.log('📦 DATABASE REQUEST PAYLOAD:', {
      leadsCount: requestPayload.leads.length,
      fileId: requestPayload.fileId,
      fileName: requestPayload.fileName,
      sampleLead: requestPayload.leads[0]
    });
    
    const dbResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'sendToDatabase', 
        payload: requestPayload 
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    console.log('📡 Database response from background:', dbResponse);
    
    if (!dbResponse || !dbResponse.success) {
      throw new Error(dbResponse?.error || 'Database request failed');
    }
    
    console.log('✅ Database success via background script:', dbResponse.result);
    
    console.log('📋 Step 5: Verifying database save...');
    showSuccess('Step 5: Verifying database save...');
    
    // Wait a moment for database to process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify the data was actually saved
    let verificationAttempts = 0;
    const maxVerificationAttempts = 5;
    let verified = false;
    
    while (!verified && verificationAttempts < maxVerificationAttempts) {
      verificationAttempts++;
      console.log(`🔍 Verification attempt ${verificationAttempts}/${maxVerificationAttempts}`);
      
      try {
        const statsResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ 
            action: 'getFileStats', 
            fileId: currentFileId 
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        console.log('📊 Stats response:', statsResponse);
        
        if (statsResponse && statsResponse.success && statsResponse.stats.current_total > 0) {
          verified = true;
          console.log('✅ Database save VERIFIED!');
          showSuccess(`✅ SUCCESS! ${dbResponse.result.insertedCount} leads saved and verified in database!`);
          
          // Update UI stats
          await updateFileStats(currentFileId);
          
          // Start polling for processing updates
          startPolling();
          
        } else {
          console.log(`⏳ Verification attempt ${verificationAttempts} - waiting for database...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (verifyError) {
        console.error(`❌ Verification attempt ${verificationAttempts} failed:`, verifyError);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!verified) {
      console.error('❌ CRITICAL: Could not verify database save!');
      showError('⚠️ Extraction completed but could not verify database save. Check Railway logs.');
    }
    
  } catch (error) {
    console.error('❌ EXTRACTION FAILED:', error);
    showError(`❌ EXTRACTION FAILED: ${error.message}`);
    
    // Detailed debugging info
    console.log('🔍 DEBUGGING INFO:');
    console.log('- Current file ID:', currentFileId);
    console.log('- API Base URL:', API_BASE_URL);
    console.log('- Error details:', error);
    
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
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'downloadCSV', 
        fileId: currentFileId 
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (!response || !response.success) {
      throw new Error(response?.error || 'Download failed');
    }
    
    showSuccess('CSV downloaded successfully!');
    
  } catch (error) {
    console.error('❌ Download error:', error);
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
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'getFileStats', 
        fileId: fileId 
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (response && response.success) {
      const stats = response.stats;
      console.log('📊 Updated stats:', stats);
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
    console.error('Failed to update stats:', error);
  }
}

function showError(message) {
  console.error('🚨 ERROR MESSAGE:', message);
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
  console.log('✅ SUCCESS MESSAGE:', message);
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    const div = document.createElement('div');
    div.className = 'success';
    div.textContent = message;
    messagesDiv.appendChild(div);
    setTimeout(() => div.remove(), 10000);
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
  
  console.log('🔄 Starting stats polling...');
  pollingInterval = setInterval(async () => {
    if (currentFileId) {
      await updateFileStats(currentFileId);
    }
  }, 5000);
}