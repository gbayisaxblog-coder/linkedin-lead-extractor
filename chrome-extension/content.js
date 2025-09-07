console.log('🚀 [CONTENT] LinkedIn Lead Extractor v2.0 loaded - With Frontend Duplicates');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 [CONTENT] Message received:', request.action);
  
  if (request.action === 'extractLeads') {
    const maxPages = request.maxPages || 1;
    const fileId = request.fileId;
    const fileName = request.fileName;
    
    console.log(`🚀 [CONTENT] Starting extraction for ${maxPages} pages with duplicate checking`);
    
    (async () => {
      try {
        const result = await extractWithDuplicateChecking(maxPages, fileId, fileName);
        
        console.log('📤 [CONTENT] Extraction complete:', result);
        
        sendResponse({ 
          success: true, 
          leadsCount: result.totalLeads,
          pagesProcessed: result.pagesProcessed,
          savedToDatabase: result.savedCount,
          duplicatesFound: result.duplicatesCount
        });
        
        console.log('✅ [CONTENT] Response sent successfully');
        
      } catch (error) {
        console.error('❌ [CONTENT] Extraction error:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          leadsCount: 0,
          savedToDatabase: 0
        });
      }
    })();
    
    return true;
  }
  
  return false;
});

async function extractWithDuplicateChecking(maxPages, fileId, fileName) {
  console.log(`[CONTENT] Starting extraction with duplicate checking for ${maxPages} pages`);
  
  const allLeads = [];
  let currentPage = 1;
  let pagesProcessed = 0;
  let totalSaved = 0;
  let totalDuplicates = 0;
  let totalStats = { new: 0, duplicates: 0, failed: 0, processed: 0, saved: 0 };
  
  // Create persistent stats box
  addPersistentStatsIndicator(maxPages);
  
  try {
    while (currentPage <= maxPages) {
      console.log(`[CONTENT] 📄 Processing page ${currentPage}/${maxPages}`);
      updatePersistentStats(currentPage, maxPages, `Extracting page ${currentPage}...`, totalStats);
      
      // Extract leads from current page with duplicate checking
      const pageResult = await extractPageWithDuplicateCheck(currentPage, totalStats, fileId, fileName);
      
      if (pageResult.newLeads.length === 0 && pageResult.duplicates === 0 && pageResult.failed === 0) {
        console.log(`[CONTENT] No leads found on page ${currentPage}, stopping`);
        break;
      }
      
      console.log(`[CONTENT] ✅ Page ${currentPage}: ${pageResult.newLeads.length} NEW, ${pageResult.duplicates} duplicates, ${pageResult.failed} failed`);
      
      // Save only NEW leads to database
      if (pageResult.newLeads.length > 0) {
        updatePersistentStats(currentPage, maxPages, `Saving ${pageResult.newLeads.length} NEW leads to database...`, totalStats);
        
        const savedCount = await sendLeadsToDatabase(pageResult.newLeads, fileId, fileName);
        totalSaved += savedCount;
        totalStats.saved += savedCount;
        
        console.log(`[CONTENT] 💾 Saved ${savedCount}/${pageResult.newLeads.length} NEW leads from page ${currentPage}`);
        updatePersistentStats(currentPage, maxPages, `✅ Verified ${savedCount} leads saved to database`, totalStats);
      }
      
      allLeads.push(...pageResult.newLeads);
      pagesProcessed = currentPage;
      totalDuplicates += pageResult.duplicates;
      
      // Update total stats
      totalStats.new += pageResult.newLeads.length;
      totalStats.duplicates += pageResult.duplicates;
      totalStats.failed += pageResult.failed;
      totalStats.processed += pageResult.totalProcessed;
      
      updatePersistentStats(currentPage, maxPages, `Page ${currentPage} complete - ${totalStats.saved} total saved`, totalStats);
      
      // Go to next page if not the last page
      if (currentPage < maxPages) {
        updatePersistentStats(currentPage, maxPages, `Going to page ${currentPage + 1}...`, totalStats);
        
        const hasNextPage = await goToNextPageSequential(currentPage);
        if (!hasNextPage) {
          console.log('[CONTENT] No more pages available');
          break;
        }
        
        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        break;
      }
    }
    
    console.log(`[CONTENT] 🎉 EXTRACTION COMPLETE!`);
    console.log(`[CONTENT] Final results: ${totalStats.new} NEW, ${totalStats.duplicates} duplicates, ${totalSaved} saved`);
    
    updatePersistentStats(pagesProcessed, maxPages, `🎉 COMPLETE! ${totalSaved} saved, ${totalStats.duplicates} duplicates found`, totalStats);
    
    // Keep stats visible for 60 seconds
    setTimeout(() => {
      removeAllMarkers();
      removePersistentStats();
    }, 60000);
    
    return {
      totalLeads: allLeads.length,
      savedCount: totalSaved,
      duplicatesCount: totalDuplicates,
      pagesProcessed: pagesProcessed
    };
    
  } catch (error) {
    console.error('[CONTENT] Extraction error:', error);
    removeAllMarkers();
    removePersistentStats();
    throw error;
  }
}

async function extractPageWithDuplicateCheck(currentPage, globalStats, fileId, fileName) {
  const allExtractedData = [];
  const newLeads = [];
  let failedCount = 0;
  let duplicateCount = 0;
  let totalProcessed = 0;
  
  console.log(`[CONTENT] 🚀 Starting page ${currentPage} extraction with duplicate checking`);
  
  // STEP 1: Extract all leads from current page (10% slower scrolling)
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1100)); // Was 1000ms, now 1100ms (+10%)
  
  let lastProfileCount = 0;
  let stableCount = 0;
  
  while (stableCount < 3) {
    const profileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    for (let i = lastProfileCount; i < profileContainers.length; i++) {
      const container = profileContainers[i];
      
      if (container.getAttribute('data-extractor-processed')) continue;
      
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 242)); // Was 220ms, now 242ms (+10%)
      
      const leadElement = container.querySelector('[data-x-search-result="LEAD"]');
      
      if (leadElement) {
        const lead = extractLeadFromElement(leadElement);
        
        if (lead && lead.fullName && lead.company) {
          allExtractedData.push({ lead, container, index: totalProcessed + 1 });
          console.log(`[CONTENT] 📋 Extracted: ${lead.fullName} - ${lead.company}`);
        } else {
          markProfileAsExtracted(container, 'failed');
          failedCount++;
          console.log(`[CONTENT] ❌ ${totalProcessed + 1}: Invalid data`);
        }
      } else {
        markProfileAsExtracted(container, 'failed');
        failedCount++;
        console.log(`[CONTENT] ❌ ${totalProcessed + 1}: No lead element found`);
      }
      
      container.setAttribute('data-extractor-processed', 'true');
      totalProcessed++;
      
      // Update stats in real-time
      const currentStats = {
        new: globalStats.new,
        duplicates: globalStats.duplicates,
        failed: globalStats.failed + failedCount,
        processed: globalStats.processed + totalProcessed,
        saved: globalStats.saved
      };
      updatePersistentStats(currentPage, 1, `Processing profile ${totalProcessed}...`, currentStats);
    }
    
    lastProfileCount = profileContainers.length;
    
    // Scroll down more (10% slower)
    window.scrollBy(0, window.innerHeight * 0.6);
    await new Promise(resolve => setTimeout(resolve, 1210)); // Was 1100ms, now 1210ms (+10%)
    
    const newProfileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    if (newProfileContainers.length > profileContainers.length) {
      stableCount = 0;
    } else {
      stableCount++;
    }
    
    // Stop if pagination is visible
    const paginationVisible = document.querySelector('.artdeco-pagination')?.getBoundingClientRect();
    if (paginationVisible && paginationVisible.top < window.innerHeight) {
      break;
    }
  }
  
  console.log(`[CONTENT] 📋 Extraction complete: ${allExtractedData.length} potential leads`);
  
  // STEP 2: Check duplicates for this page
  if (allExtractedData.length > 0) {
    updatePersistentStats(currentPage, 1, `Checking ${allExtractedData.length} leads for duplicates...`, globalStats);
    
    const leadsToCheck = allExtractedData.map(item => ({
      fullName: item.lead.fullName,
      company: item.lead.company
    }));
    
    const duplicateResults = await checkPageDuplicates(leadsToCheck);
    
    // STEP 3: Apply markers based on duplicate check results
    updatePersistentStats(currentPage, 1, `Applying markers to ${allExtractedData.length} profiles...`, globalStats);
    
    for (let i = 0; i < allExtractedData.length; i++) {
      const { lead, container, index } = allExtractedData[i];
      const isDuplicate = duplicateResults[i];
      
      if (isDuplicate) {
        markProfileAsExtracted(container, 'duplicate');
        duplicateCount++;
        console.log(`[CONTENT] 🔄 ${index}: DUPLICATE - ${lead.fullName} - ${lead.company}`);
      } else {
        newLeads.push(lead);
        markProfileAsExtracted(container, 'new');
        console.log(`[CONTENT] ✓ ${index}: NEW - ${lead.fullName} - ${lead.company}`);
      }
    }
  }
  
  console.log(`[CONTENT] ✅ Page ${currentPage} complete: ${newLeads.length} NEW, ${duplicateCount} duplicates, ${failedCount} failed`);
  
  return {
    newLeads: newLeads,
    duplicates: duplicateCount,
    failed: failedCount,
    totalProcessed: totalProcessed
  };
}

async function checkPageDuplicates(leads) {
  try {
    console.log(`[CONTENT] 🔍 Checking ${leads.length} leads for duplicates via background script...`);
    
    // Use background script to avoid CSP issues
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('[CONTENT] ⏰ Duplicate check timeout, assuming all new');
        resolve({ success: false });
      }, 15000);
      
      chrome.runtime.sendMessage({ 
        action: 'checkDuplicates', 
        leads: leads 
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.error('[CONTENT] ❌ Duplicate check error:', chrome.runtime.lastError);
          resolve({ success: false });
        } else {
          resolve(response);
        }
      });
    });
    
    if (response && response.success && response.duplicates) {
      const duplicateCount = response.duplicates.filter(d => d).length;
      console.log(`[CONTENT] ✅ Duplicate check complete: ${duplicateCount} duplicates found`);
      return response.duplicates;
    } else {
      console.log('[CONTENT] ⚠️ Duplicate check failed, assuming all new');
      return leads.map(() => false); // Assume all new if check fails
    }
    
  } catch (error) {
    console.error('[CONTENT] ❌ Error checking duplicates:', error);
    return leads.map(() => false); // Assume all new on error
  }
}

async function sendLeadsToDatabase(leads, fileId, fileName) {
  try {
    console.log(`[CONTENT] 📤 Sending ${leads.length} NEW leads to database...`);
    
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database send timeout'));
      }, 30000);
      
      chrome.runtime.sendMessage({ 
        action: 'sendToDatabase', 
        payload: {
          leads: leads,
          fileId: fileId,
          fileName: fileName,
          userId: 'chrome_extension_user'
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
    
    if (response && response.success) {
      const insertedCount = response.result.insertedCount || 0;
      console.log(`[CONTENT] ✅ Database save successful: ${insertedCount} inserted`);
      return insertedCount;
    } else {
      console.error(`[CONTENT] ❌ Database save failed:`, response?.error);
      return 0;
    }
    
  } catch (error) {
    console.error('[CONTENT] ❌ Database send error:', error);
    return 0;
  }
}

async function goToNextPageSequential(currentPageNum) {
  try {
    console.log(`[CONTENT] 🔍 Looking for next page button (current: ${currentPageNum})...`);
    
    // Scroll to pagination area first
    const paginationElement = document.querySelector('.artdeco-pagination');
    if (paginationElement) {
      paginationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 2200)); // Was 2000ms, now 2200ms (+10%)
    }
    
    const nextPageNum = currentPageNum + 1;
    console.log(`[CONTENT] 📄 Looking for page: ${nextPageNum}`);
    
    // Try multiple selectors for next page button in order of preference
    let nextButton = null;
    
    // Method 1: Direct page number button
    nextButton = document.querySelector(`button[aria-label="Page ${nextPageNum}"]:not([disabled])`);
    console.log(`[CONTENT] Method 1 - Page ${nextPageNum} button:`, !!nextButton);
    
    if (!nextButton) {
      // Method 2: Data test attribute
      nextButton = document.querySelector(`[data-test-pagination-page-btn="${nextPageNum}"] button:not([disabled])`);
      console.log(`[CONTENT] Method 2 - Data test button:`, !!nextButton);
    }
    
    if (!nextButton) {
      // Method 3: Look for any button with the next page number as text
      const allButtons = document.querySelectorAll('.artdeco-pagination button:not([disabled])');
      for (const btn of allButtons) {
        const btnText = btn.textContent.trim();
        if (btnText === nextPageNum.toString()) {
          nextButton = btn;
          console.log(`[CONTENT] Method 3 - Found button with text "${btnText}"`);
          break;
        }
      }
    }
    
    if (!nextButton) {
      // Method 4: Generic "Next" button (fallback)
      nextButton = document.querySelector('button[aria-label="Next"]:not([disabled])');
      console.log(`[CONTENT] Method 4 - Next button:`, !!nextButton);
    }
    
    if (!nextButton || nextButton.disabled) {
      console.log('[CONTENT] ❌ No next page button found');
      
      // Debug: Show all available pagination buttons
      const availableButtons = document.querySelectorAll('.artdeco-pagination button');
      console.log('[CONTENT] 🔍 Available pagination buttons:');
      availableButtons.forEach((btn, i) => {
        console.log(`[CONTENT]   ${i + 1}: "${btn.textContent.trim()}" - disabled: ${btn.disabled} - aria-label: "${btn.getAttribute('aria-label')}"`);
      });
      
      return false;
    }
    
    console.log(`[CONTENT] ✅ Found next page button: "${nextButton.textContent.trim()}" (${nextButton.getAttribute('aria-label')})`);
    
    // Clear any existing processed markers before clicking (fresh page)
    document.querySelectorAll('[data-extractor-processed]').forEach(el => {
      el.removeAttribute('data-extractor-processed');
    });
    
    nextButton.click();
    console.log('[CONTENT] 🔄 Clicked next page button, waiting for page load...');
    
    const pageLoaded = await waitForNewPageLoadComplete(nextPageNum);
    return pageLoaded;
    
  } catch (error) {
    console.error('[CONTENT] Error navigating to next page:', error);
    return false;
  }
}

async function waitForNewPageLoadComplete(expectedPageNum) {
  console.log(`[CONTENT] ⏳ Waiting for page ${expectedPageNum} to fully load...`);
  
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 30;
    
    const checkInterval = setInterval(() => {
      attempts++;
      
      // Check if we're on the expected page
      const currentPageElement = document.querySelector('[aria-current="true"]');
      const actualPageNum = currentPageElement ? parseInt(currentPageElement.textContent) : 0;
      
      // Check page content is loaded
      const hasProfiles = document.querySelectorAll('li.artdeco-list__item').length > 0;
      const documentReady = document.readyState === 'complete';
      
      // Check that profiles have actual data (names)
      const hasValidNames = Array.from(document.querySelectorAll('li.artdeco-list__item')).some(item => {
        const nameEl = item.querySelector('span[data-anonymize="person-name"]');
        return nameEl && nameEl.textContent.trim().length > 2;
      });
      
      // Check that we're not still loading
      const isLoading = document.querySelector('.artdeco-loader') || 
                       document.querySelector('.loading-state') ||
                       document.querySelector('[data-test="loading"]');
      
      // All conditions for successful page load
      const pageNumMatches = actualPageNum === expectedPageNum;
      const contentReady = hasProfiles && documentReady && hasValidNames && !isLoading;
      
      if (pageNumMatches && contentReady) {
        clearInterval(checkInterval);
        console.log(`[CONTENT] ✅ Page ${expectedPageNum} fully loaded with ${hasProfiles} profiles and valid names`);
        resolve(true);
        return;
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.log(`[CONTENT] ⏰ Page load timeout after ${attempts} attempts`);
        console.log(`[CONTENT] 🔍 Final status: expectedPage=${expectedPageNum}, actualPage=${actualPageNum}, hasProfiles=${hasProfiles}, documentReady=${documentReady}, hasValidNames=${hasValidNames}, isLoading=${!!isLoading}`);
        resolve(false);
        return;
      }
      
      if (attempts % 5 === 0) { // Log every 5 attempts
        console.log(`[CONTENT] ⏳ Waiting for page ${expectedPageNum}... attempt ${attempts}/${maxAttempts}`);
        console.log(`[CONTENT] 🔍 Status: expectedPage=${expectedPageNum}, actualPage=${actualPageNum}, profiles=${hasProfiles}, ready=${documentReady}, names=${hasValidNames}, loading=${!!isLoading}`);
      }
    }, 1100); // Was 1000ms, now 1100ms (+10%)
  });
}

function extractLeadFromElement(element) {
  try {
    // Extract name with multiple selectors
    let fullName = '';
    const nameSelectors = [
      'span[data-anonymize="person-name"]',
      '.entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__title-text span',
      'a[data-control-name="search_srp_result"] span[aria-hidden="true"]',
      '.artdeco-entity-lockup__title a span'
    ];
    
    for (const selector of nameSelectors) {
      const nameEl = element.querySelector(selector);
      if (nameEl && nameEl.textContent.trim()) {
        fullName = nameEl.textContent.trim();
        break;
      }
    }
    
    if (!fullName) return null;
    
    // Clean name
    fullName = fullName
      .replace(/[^\w\s\-'\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
    
    if (fullName.length < 2) return null;
    
    // Extract company with multiple selectors
    let company = '';
    const companySelectors = [
      'a[data-anonymize="company-name"]',
      '.entity-result__primary-subtitle',
      '.entity-result__secondary-subtitle', 
      '.artdeco-entity-lockup__subtitle a'
    ];
    
    for (const selector of companySelectors) {
      const companyEl = element.querySelector(selector);
      if (companyEl && companyEl.textContent.trim()) {
        company = companyEl.textContent.trim();
        // Clean company name
        company = company
          .replace(/^at\s+/i, '')
          .replace(/\s+•.*$/, '')
          .trim();
        if (company && !company.includes('connection') && company.length > 1) {
          break;
        }
      }
    }
    
    if (!company) return null;
    
    // Clean company
    company = company
      .replace(/[^\w\s\-&'\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
    
    if (company.length < 2) return null;
    
    // Extract optional fields
    let title = '';
    const titleEl = element.querySelector('span[data-anonymize="title"]');
    if (titleEl) {
      title = titleEl.textContent.trim().substring(0, 200);
    }
    
    let location = '';
    const locationEl = element.querySelector('span[data-anonymize="location"]');
    if (locationEl) {
      location = locationEl.textContent.trim().substring(0, 100);
    }
    
    let linkedinUrl = '';
    const linkEl = element.querySelector('a[data-control-name="search_srp_result"]') ||
                  element.querySelector('.entity-result__title-text a');
    if (linkEl && linkEl.href) {
      linkedinUrl = linkEl.href.substring(0, 500);
    }
    
    return {
      fullName: fullName,
      company: company,
      title: title,
      location: location,
      linkedinUrl: linkedinUrl,
      extractedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[CONTENT] Error extracting lead:', error);
    return null;
  }
}

// Updated marking function with 3 states: NEW (green), DUPLICATE (yellow), FAILED (red)
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
    title = 'NEW lead - will be saved to database';
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
    z-index: 10000;
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

// PERSISTENT stats indicator (updated with duplicates counter)
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
    min-width: 400px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.1);
  `;
  
  indicator.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div style="font-weight: bold; font-size: 16px;">🚀 LinkedIn Lead Extractor v2.0</div>
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
              <span style="font-size: 16px;">💾</span> <span id="saved-count">SAVED: 0</span>
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
  const minimizeBtn = document.getElementById('minimize-stats');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      const content = document.getElementById('stats-content');
      
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
  }
  
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
  const savedCount = document.getElementById('saved-count');
  
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
  if (savedCount) savedCount.textContent = `SAVED: ${stats.saved}`;
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

console.log('✅ [CONTENT] Content script ready with frontend duplicate checking and 10% slower scrolling');