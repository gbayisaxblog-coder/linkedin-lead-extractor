// Ensure script loads properly
console.log('🚀 LinkedIn Lead Extractor content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  
  if (request.action === 'extractLeads') {
    const maxPages = request.maxPages || 1;
    const apiBaseUrl = request.apiBaseUrl || 'https://linkedin-lead-extractor-production.up.railway.app/api';
    
    extractAllLeadsWithPagination(maxPages, apiBaseUrl).then(result => {
      sendResponse({ 
        success: true, 
        leads: result.leads,
        pagesProcessed: result.pagesProcessed
      });
    }).catch(error => {
      console.error('Extraction error:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    });
    
    return true;
  }
});

async function extractAllLeadsWithPagination(maxPages = 1, apiBaseUrl) {
  const allLeads = [];
  let currentPage = 1;
  let pagesProcessed = 0;
  let totalStats = { new: 0, duplicates: 0, failed: 0, processed: 0 };
  
  console.log(`Starting LinkedIn lead extraction for ${maxPages} pages...`);
  addPersistentStatsIndicator(maxPages);
  
  try {
    while (currentPage <= maxPages) {
      updatePersistentStats(currentPage, maxPages, `Extracting page ${currentPage}...`, totalStats);
      
      // Extract all leads from current page with FAST batch checking
      const pageResult = await extractLeadsWithFastDuplicateCheck(currentPage, apiBaseUrl, totalStats);
      
      if (pageResult.newLeads.length === 0 && pageResult.duplicates === 0 && pageResult.failed === 0) {
        console.log(`No leads found on page ${currentPage}, stopping extraction`);
        break;
      }
      
      console.log(`✅ Page ${currentPage}: ${pageResult.newLeads.length} NEW, ${pageResult.duplicates} duplicates, ${pageResult.failed} failed`);
      allLeads.push(...pageResult.newLeads);
      pagesProcessed = currentPage;
      
      // Update total stats
      totalStats.new += pageResult.newLeads.length;
      totalStats.duplicates += pageResult.duplicates;
      totalStats.failed += pageResult.failed;
      totalStats.processed += pageResult.totalProcessed;
      
      updatePersistentStats(currentPage, maxPages, `Page ${currentPage} complete`, totalStats);
      
      if (currentPage >= maxPages) break;
      
      updatePersistentStats(currentPage, maxPages, `Going to page ${currentPage + 1}...`, totalStats);
      
      const hasNextPage = await goToNextPage();
      if (!hasNextPage) {
        console.log('No more pages available');
        break;
      }
      
      currentPage++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`🎉 EXTRACTION COMPLETE!`);
    console.log(`Total: ${totalStats.new} NEW, ${totalStats.duplicates} duplicates, ${totalStats.failed} failed`);
    
    updatePersistentStats(pagesProcessed, maxPages, `🎉 COMPLETE! ${totalStats.new} new leads found`, totalStats);
    
    // Keep stats visible for 30 seconds after completion
    setTimeout(() => {
      removeAllMarkers();
      removePersistentStats();
    }, 30000);
    
    return {
      leads: allLeads,
      pagesProcessed: pagesProcessed
    };
    
  } catch (error) {
    console.error('Error during extraction:', error);
    removeAllMarkers();
    removePersistentStats();
    throw error;
  }
}

async function extractLeadsWithFastDuplicateCheck(currentPage, apiBaseUrl, globalStats) {
  const allExtractedData = [];
  const newLeads = [];
  let failedCount = 0;
  let duplicateCount = 0;
  
  console.log(`🚀 Starting FAST extraction for page ${currentPage}`);
  
  // STEP 1: FAST EXTRACTION (No database calls)
  updatePersistentStats(currentPage, 1, `Page ${currentPage}: Fast extraction...`, globalStats);
  
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  let lastProfileCount = 0;
  let stableCount = 0;
  let totalProcessed = 0;
  
  while (stableCount < 3) {
    const profileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    // Process profiles quickly
    for (let i = lastProfileCount; i < profileContainers.length; i++) {
      const container = profileContainers[i];
      
      if (container.getAttribute('data-extractor-processed')) continue;
      
      // Quick scroll
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const leadElement = container.querySelector('[data-x-search-result="LEAD"]');
      
      if (leadElement) {
        const lead = extractLeadFromElement(leadElement);
        
        if (lead && lead.firstName && lead.lastName && lead.company) {
          allExtractedData.push({ lead, container, index: totalProcessed + 1 });
          console.log(`📋 Extracted: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
        } else {
          markProfileAsExtracted(container, 'failed');
          failedCount++;
          
          // Debug why it failed
          const issues = [];
          if (!lead?.firstName) issues.push('no firstName');
          if (!lead?.lastName || lead?.lastName === 'Unknown') issues.push('no lastName');
          if (!lead?.company) issues.push('no company');
          console.log(`❌ Failed: ${issues.join(', ')} | Found: ${lead?.firstName || 'none'} ${lead?.lastName || 'none'} - ${lead?.company || 'none'}`);
        }
      } else {
        markProfileAsExtracted(container, 'failed');
        failedCount++;
        console.log(`❌ No lead element found in profile ${totalProcessed + 1}`);
      }
      
      container.setAttribute('data-extractor-processed', 'true');
      totalProcessed++;
      
      // Update stats in real-time
      const currentStats = {
        new: globalStats.new,
        duplicates: globalStats.duplicates,
        failed: globalStats.failed + failedCount,
        processed: globalStats.processed + totalProcessed
      };
      updatePersistentStats(currentPage, 1, `Processing profile ${totalProcessed}...`, currentStats);
    }
    
    lastProfileCount = profileContainers.length;
    
    window.scrollBy(0, window.innerHeight * 0.6);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newProfileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    if (newProfileContainers.length > profileContainers.length) {
      stableCount = 0;
    } else {
      stableCount++;
    }
    
    const paginationVisible = document.querySelector('.artdeco-pagination')?.getBoundingClientRect();
    if (paginationVisible && paginationVisible.top < window.innerHeight) {
      break;
    }
  }
  
  console.log(`📋 Fast extraction complete: ${allExtractedData.length} potential leads`);
  
  // STEP 2: BATCH DUPLICATE CHECK
  if (allExtractedData.length > 0) {
    updatePersistentStats(currentPage, 1, `Page ${currentPage}: Checking ${allExtractedData.length} leads for duplicates...`, globalStats);
    
    const leadsToCheck = allExtractedData.map(item => ({
      firstName: item.lead.firstName,
      lastName: item.lead.lastName,
      company: item.lead.company
    }));
    
    const duplicateResults = await checkBatchDuplicates(leadsToCheck, apiBaseUrl);
    
    // STEP 3: APPLY MARKERS ALL AT ONCE
    updatePersistentStats(currentPage, 1, `Page ${currentPage}: Applying markers...`, globalStats);
    
    for (let i = 0; i < allExtractedData.length; i++) {
      const { lead, container, index } = allExtractedData[i];
      const isDuplicate = duplicateResults[i];
      
      if (isDuplicate) {
        markProfileAsExtracted(container, 'duplicate');
        duplicateCount++;
        console.log(`🔄 ${index}: DUPLICATE - ${lead.firstName} ${lead.lastName} - ${lead.company}`);
      } else {
        newLeads.push(lead);
        markProfileAsExtracted(container, 'new');
        console.log(`✓ ${index}: NEW - ${lead.firstName} ${lead.lastName} - ${lead.company}`);
      }
    }
  }
  
  console.log(`✅ Page ${currentPage} complete: ${newLeads.length} NEW, ${duplicateCount} duplicates, ${failedCount} failed`);
  
  return {
    newLeads: newLeads,
    duplicates: duplicateCount,
    failed: failedCount,
    totalProcessed: totalProcessed
  };
}

async function checkBatchDuplicates(leads, apiBaseUrl) {
  try {
    console.log(`🔍 Checking ${leads.length} leads for duplicates...`);
    
    const response = await fetch(`${apiBaseUrl}/extraction/check-batch-duplicates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads })
    });
    
    if (!response.ok) {
      console.error('Batch duplicate check failed:', response.status);
      return leads.map(() => false);
    }
    
    const result = await response.json();
    console.log(`✅ Duplicate check complete: ${result.duplicates.filter(d => d).length} duplicates found`);
    
    return result.duplicates || leads.map(() => false);
  } catch (error) {
    console.error('Error checking batch duplicates:', error);
    return leads.map(() => false);
  }
}

function extractLeadFromElement(element) {
  const lead = {};
  
  try {
    // Extract name with better error handling
    const nameElement = element.querySelector('span[data-anonymize="person-name"]');
    if (nameElement) {
      const fullName = nameElement.textContent.trim();
      
      if (!fullName) {
        console.log('❌ Empty name found');
        return null;
      }
      
      // Clean up name more aggressively
      const cleanName = fullName
        .replace(/,?\s*(ChFC®|CLU®|CAP®|PhD|MBA|CPA|Esq\.?|Jr\.?|Sr\.?|III|II|IV)\s*/gi, '')
        .replace(/\s+Advising.*$/gi, '')
        .replace(/\s+Legacy.*$/gi, '')
        .trim();
      
      const nameParts = cleanName.split(' ').filter(part => part.length > 1); // Require at least 2 characters
      
      if (nameParts.length >= 2) {
        lead.firstName = nameParts[0];
        lead.lastName = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1 && nameParts[0].length > 1) {
        lead.firstName = nameParts[0];
        lead.lastName = 'Unknown';
      } else {
        console.log(`❌ Invalid name format: "${fullName}" → "${cleanName}"`);
        return null;
      }
    } else {
      console.log('❌ No name element found');
      return null;
    }
    
    // Extract title
    const titleElement = element.querySelector('span[data-anonymize="title"]');
    if (titleElement) {
      lead.title = titleElement.textContent.trim();
    }
    
    // Extract company with multiple methods and better validation
    let company = '';
    
    // Method 1: Company link
    const companyElement = element.querySelector('a[data-anonymize="company-name"]');
    if (companyElement) {
      company = companyElement.textContent.trim();
    }
    
    // Method 2: Any link in subtitle
    if (!company) {
      const anyCompanyLink = element.querySelector('.artdeco-entity-lockup__subtitle a');
      if (anyCompanyLink) {
        company = anyCompanyLink.textContent.trim();
      }
    }
    
    // Method 3: Parse subtitle text
    if (!company) {
      const subtitleElement = element.querySelector('.artdeco-entity-lockup__subtitle');
      if (subtitleElement) {
        const text = subtitleElement.textContent;
        const parts = text.split('•').map(p => p.trim());
        if (parts.length > 1 && parts[1].length > 2) {
          company = parts[1];
        }
      }
    }
    
    if (company) {
      // Clean up company name more thoroughly
      company = company
        .replace(/^[^\w\s]+\s*/, '') // Remove leading symbols
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/\s+(Inc|LLC|Ltd|Corp|Co)\.?$/i, '') // Remove common suffixes
        .trim();
      
      if (company.length > 2) { // Require at least 3 characters
        lead.company = company;
      } else {
        console.log(`❌ Company name too short: "${company}"`);
        return null;
      }
    } else {
      console.log('❌ No company found');
      return null;
    }
    
    // Extract location
    const locationElement = element.querySelector('span[data-anonymize="location"]');
    if (locationElement) {
      lead.location = locationElement.textContent.trim();
    }
    
    // Extract LinkedIn URL
    const linkElement = element.querySelector('a[data-lead-search-result*="profile-link"]');
    if (linkElement) {
      lead.linkedinUrl = linkElement.href;
    }
    
    return lead;
    
  } catch (error) {
    console.error('Error extracting lead data:', error);
    return null;
  }
}

// Updated marking function with 3 states
function markProfileAsExtracted(container, status) {
  container.setAttribute('data-extractor-processed', 'true');
  
  const existingMarker = container.querySelector('.extractor-marker');
  if (existingMarker) {
    existingMarker.remove();
  }
  
  const marker = document.createElement('div');
  marker.className = 'extractor-marker';
  
  let backgroundColor, emoji, title;
  
  if (status === 'new') {
    backgroundColor = '#28a745'; // Green
    emoji = '✓';
    title = 'NEW lead extracted successfully';
  } else if (status === 'duplicate') {
    backgroundColor = '#ffc107'; // Yellow
    emoji = '🔄';
    title = 'DUPLICATE - already in database';
  } else {
    backgroundColor = '#dc3545'; // Red
    emoji = '✗';
    title = 'FAILED - missing required data';
  }
  
  marker.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: ${backgroundColor};
    color: white;
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    font-family: Arial, sans-serif;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  `;
  marker.textContent = emoji;
  marker.title = title;
  
  const containerStyle = window.getComputedStyle(container);
  if (containerStyle.position === 'static') {
    container.style.position = 'relative';
  }
  
  container.appendChild(marker);
}

function removeAllMarkers() {
  const markers = document.querySelectorAll('.extractor-marker');
  markers.forEach(marker => marker.remove());
  
  const processedContainers = document.querySelectorAll('[data-extractor-processed]');
  processedContainers.forEach(container => {
    container.removeAttribute('data-extractor-processed');
    container.style.position = '';
  });
}

async function goToNextPage() {
  try {
    console.log('🔍 Looking for next page button...');
    
    const paginationElement = document.querySelector('.artdeco-pagination');
    if (paginationElement) {
      paginationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const currentPageElement = document.querySelector('[aria-current="true"]');
    let nextPageNum = 2;
    
    if (currentPageElement) {
      const currentPageNum = parseInt(currentPageElement.textContent);
      nextPageNum = currentPageNum + 1;
      console.log(`📄 Current page: ${currentPageNum}, looking for page: ${nextPageNum}`);
    }
    
    let nextButton = document.querySelector(`[data-test-pagination-page-btn="${nextPageNum}"] button`);
    
    if (!nextButton) {
      nextButton = document.querySelector('button[aria-label="Next"]:not([disabled])');
    }
    
    if (!nextButton || nextButton.disabled) {
      console.log('❌ No next page button found');
      return false;
    }
    
    console.log(`✅ Found next page button for page ${nextPageNum}`);
    nextButton.click();
    console.log('🔄 Clicked next page, waiting for load...');
    
    await waitForNewPageLoad();
    return true;
    
  } catch (error) {
    console.error('Error navigating to next page:', error);
    return false;
  }
}

async function waitForNewPageLoad() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 15;
    
    const checkInterval = setInterval(() => {
      attempts++;
      
      const hasProfiles = document.querySelectorAll('li.artdeco-list__item').length > 0;
      const documentReady = document.readyState === 'complete';
      
      if (hasProfiles && documentReady) {
        clearInterval(checkInterval);
        console.log(`✅ New page loaded with ${hasProfiles} profiles`);
        resolve(true);
        return;
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.log(`⏰ Page load timeout`);
        resolve(false);
        return;
      }
      
      console.log(`⏳ Waiting for page load... attempt ${attempts}`);
    }, 1000);
  });
}

// PERSISTENT stats indicator that never disappears
function addPersistentStatsIndicator(maxPages) {
  removePersistentStats();
  
  const indicator = document.createElement('div');
  indicator.id = 'linkedin-extractor-persistent-stats';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #0073b1, #005885);
    color: white;
    padding: 20px;
    border-radius: 12px;
    font-size: 14px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    min-width: 380px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.1);
  `;
  
  indicator.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div style="font-weight: bold; font-size: 16px;">🚀 LinkedIn Lead Extractor</div>
      <div id="minimize-stats" style="cursor: pointer; font-size: 14px; opacity: 0.7; padding: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;" title="Minimize">−</div>
    </div>
    
    <div id="stats-content">
      <div style="margin-bottom: 12px;">
        <div id="progress-text" style="font-weight: 600; margin-bottom: 4px;">Preparing...</div>
        <div style="background: rgba(255,255,255,0.3); height: 8px; border-radius: 4px;">
          <div id="progress-bar" style="background: #90EE90; height: 100%; border-radius: 4px; width: 0%; transition: width 0.5s; box-shadow: 0 0 10px rgba(144,238,144,0.5);"></div>
        </div>
        <div id="progress-details" style="font-size: 11px; margin-top: 4px; opacity: 0.9;">Starting extraction...</div>
      </div>
      
      <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin-bottom: 12px;">
          <div>
            <div style="color: #90EE90; font-weight: bold; margin-bottom: 4px;">
              <span style="font-size: 16px;">✓</span> <span id="new-count">NEW: 0</span>
            </div>
            <div style="color: #FFD700; font-weight: bold; margin-bottom: 4px;">
              <span style="font-size: 16px;">🔄</span> <span id="duplicate-count">DUPLICATES: 0</span>
            </div>
          </div>
          <div>
            <div style="color: #FF6B6B; font-weight: bold; margin-bottom: 4px;">
              <span style="font-size: 16px;">✗</span> <span id="failed-count">FAILED: 0</span>
            </div>
            <div style="color: #87CEEB; font-weight: bold; margin-bottom: 4px;">
              <span style="font-size: 16px;">📊</span> <span id="total-processed">PROCESSED: 0</span>
            </div>
          </div>
        </div>
        
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
            <div>⏱️ <span id="extraction-time">00:00</span></div>
            <div>📄 Page: <span id="current-page-display">1</span>/<span id="total-pages-display">${maxPages}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(indicator);
  
  // Add minimize functionality
  document.getElementById('minimize-stats').addEventListener('click', () => {
    const content = document.getElementById('stats-content');
    const minimizeBtn = document.getElementById('minimize-stats');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      minimizeBtn.textContent = '−';
      minimizeBtn.title = 'Minimize';
    } else {
      content.style.display = 'none';
      minimizeBtn.textContent = '+';
      minimizeBtn.title = 'Expand';
    }
  });
  
  // Start timer
  const startTime = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeDisplay = document.getElementById('extraction-time');
    if (timeDisplay) {
      timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
  
  indicator.setAttribute('data-timer-id', timer);
}

function updatePersistentStats(currentPage, maxPages, details, stats) {
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  const progressDetails = document.getElementById('progress-details');
  const currentPageDisplay = document.getElementById('current-page-display');
  const newCount = document.getElementById('new-count');
  const duplicateCount = document.getElementById('duplicate-count');
  const failedCount = document.getElementById('failed-count');
  const totalProcessedCount = document.getElementById('total-processed');
  
  if (progressText && progressBar && progressDetails) {
    progressText.textContent = `Page ${currentPage} of ${maxPages}`;
    progressBar.style.width = `${(currentPage / maxPages) * 100}%`;
    progressDetails.textContent = details || 'Processing...';
  }
  
  if (currentPageDisplay) {
    currentPageDisplay.textContent = currentPage;
  }
  
  if (newCount) newCount.textContent = `NEW: ${stats.new}`;
  if (duplicateCount) duplicateCount.textContent = `DUPLICATES: ${stats.duplicates}`;
  if (failedCount) failedCount.textContent = `FAILED: ${stats.failed}`;
  if (totalProcessedCount) totalProcessedCount.textContent = `PROCESSED: ${stats.processed}`;
}

function removePersistentStats() {
  const indicator = document.getElementById('linkedin-extractor-persistent-stats');
  if (indicator) {
    const timerId = indicator.getAttribute('data-timer-id');
    if (timerId) {
      clearInterval(parseInt(timerId));
    }
    indicator.remove();
  }
}

// Add ready indicator
function addExtractionIndicator() {
  if (document.getElementById('linkedin-extractor-indicator')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'linkedin-extractor-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #28a745;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  indicator.textContent = '✅ LinkedIn Extractor Ready - FAST batch duplicate checking';
  
  document.body.appendChild(indicator);
  
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }, 4000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addExtractionIndicator);
} else {
  addExtractionIndicator();
}