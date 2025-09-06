// Ensure script loads properly
console.log('🚀 LinkedIn Lead Extractor content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  
  if (request.action === 'extractLeads') {
    const maxPages = request.maxPages || 1;
    
    extractAllLeadsWithPagination(maxPages).then(result => {
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

async function extractAllLeadsWithPagination(maxPages = 1) {
  const allLeads = [];
  let currentPage = 1;
  let pagesProcessed = 0;
  
  console.log(`Starting LinkedIn lead extraction for ${maxPages} pages...`);
  addProgressIndicator();
  
  try {
    while (currentPage <= maxPages) {
      updateProgressIndicator(currentPage, maxPages, `Extracting page ${currentPage}...`);
      
      // Extract all leads from current page with profile marking
      const pageLeads = await extractLeadsWithProfileMarking(currentPage);
      
      if (pageLeads.length === 0) {
        console.log(`No leads found on page ${currentPage}, stopping extraction`);
        break;
      }
      
      console.log(`✅ Page ${currentPage}: Extracted ${pageLeads.length} leads`);
      allLeads.push(...pageLeads);
      pagesProcessed = currentPage;
      
      updateExtractionCount(allLeads.length);
      
      if (currentPage >= maxPages) break;
      
      updateProgressIndicator(currentPage, maxPages, `Going to page ${currentPage + 1}...`);
      
      const hasNextPage = await goToNextPage();
      if (!hasNextPage) {
        console.log('No more pages available');
        break;
      }
      
      currentPage++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`🎉 EXTRACTION COMPLETE!`);
    console.log(`Total leads: ${allLeads.length} from ${pagesProcessed} pages`);
    
    // Clean up all markers after 5 seconds
    setTimeout(() => {
      removeAllMarkers();
    }, 5000);
    
    removeProgressIndicator();
    
    return {
      leads: allLeads,
      pagesProcessed: pagesProcessed
    };
    
  } catch (error) {
    console.error('Error during extraction:', error);
    removeAllMarkers();
    removeProgressIndicator();
    throw error;
  }
}

async function extractLeadsWithProfileMarking(currentPage) {
  const allLeads = [];
  
  console.log(`🔍 Starting profile-by-profile marking for page ${currentPage}`);
  
  // Start from top
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  let lastProfileCount = 0;
  let stableCount = 0;
  let totalProcessed = 0;
  
  while (stableCount < 3) {
    // Get all profile containers (including newly loaded ones)
    const profileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    console.log(`📋 Found ${profileContainers.length} total profiles (${profileContainers.length - lastProfileCount} new)`);
    
    // Process new profiles only
    for (let i = lastProfileCount; i < profileContainers.length; i++) {
      const container = profileContainers[i];
      
      try {
        // Skip if already processed
        if (container.getAttribute('data-extractor-processed')) {
          continue;
        }
        
        // Scroll to profile to trigger loading
        container.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // Wait for lazy loading
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Extract lead data
        const leadElement = container.querySelector('[data-x-search-result="LEAD"]');
        
        if (leadElement) {
          const lead = extractLeadFromElement(leadElement);
          
          if (lead && lead.firstName && lead.lastName && lead.company) {
            allLeads.push(lead);
            markProfileAsExtracted(container, true);
            console.log(`✓ ${totalProcessed + 1}: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
          } else {
            const missingData = [];
            if (!lead || !lead.firstName) missingData.push('firstName');
            if (!lead || !lead.lastName || lead.lastName === 'Unknown') missingData.push('lastName');
            if (!lead || !lead.company) missingData.push('company');
            
            markProfileAsExtracted(container, false);
            console.log(`❌ ${totalProcessed + 1}: Missing ${missingData.join(', ')} | Found: ${lead?.firstName || 'none'} ${lead?.lastName || 'none'} - ${lead?.company || 'none'}`);
          }
        } else {
          markProfileAsExtracted(container, false);
          console.log(`❌ ${totalProcessed + 1}: No lead element found in container`);
        }
        
        totalProcessed++;
        updateExtractionCount(allLeads.length);
        
      } catch (error) {
        console.error(`Error processing profile ${i + 1}:`, error);
        markProfileAsExtracted(container, false);
      }
    }
    
    lastProfileCount = profileContainers.length;
    
    // Scroll down to potentially load more profiles
    const scrollAmount = window.innerHeight * 0.6;
    window.scrollBy(0, scrollAmount);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for new profiles
    const newProfileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    if (newProfileContainers.length > profileContainers.length) {
      console.log(`📋 Loaded ${newProfileContainers.length - profileContainers.length} more profiles`);
      stableCount = 0;
    } else {
      stableCount++;
      console.log(`🔄 No new profiles loaded. Stable count: ${stableCount}/3`);
    }
    
    // Check if we've reached pagination
    const paginationVisible = document.querySelector('.artdeco-pagination')?.getBoundingClientRect();
    if (paginationVisible && paginationVisible.top < window.innerHeight) {
      console.log('📄 Reached pagination area');
      break;
    }
  }
  
  console.log(`✅ Page ${currentPage} complete: ${allLeads.length} leads from ${totalProcessed} profiles processed`);
  return allLeads;
}

function extractLeadFromElement(element) {
  const lead = {};
  
  try {
    // Extract name
    const nameElement = element.querySelector('span[data-anonymize="person-name"]');
    if (nameElement) {
      const fullName = nameElement.textContent.trim();
      
      // Clean up name
      const cleanName = fullName
        .replace(/,?\s*(ChFC®|CLU®|CAP®|PhD|MBA|CPA|Esq\.?|Jr\.?|Sr\.?|III|II|IV)\s*/gi, '')
        .replace(/\s+Advising.*$/gi, '')
        .trim();
      
      const nameParts = cleanName.split(' ').filter(part => part.length > 0);
      
      if (nameParts.length >= 2) {
        lead.firstName = nameParts[0];
        lead.lastName = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1) {
        lead.firstName = nameParts[0];
        lead.lastName = 'Unknown';
      }
    }
    
    // Extract title
    const titleElement = element.querySelector('span[data-anonymize="title"]');
    if (titleElement) {
      lead.title = titleElement.textContent.trim();
    }
    
    // Extract company with multiple methods
    let company = '';
    
    // Method 1: Company link
    const companyElement = element.querySelector('a[data-anonymize="company-name"]');
    if (companyElement) {
      company = companyElement.textContent.trim();
    }
    
    // Method 2: Parse subtitle if no company link
    if (!company) {
      const subtitleElement = element.querySelector('.artdeco-entity-lockup__subtitle');
      if (subtitleElement) {
        const text = subtitleElement.textContent;
        // Look for company after bullet point
        const parts = text.split('•').map(p => p.trim());
        if (parts.length > 1) {
          company = parts[1];
        } else {
          // Look for any link in subtitle
          const anyLink = subtitleElement.querySelector('a');
          if (anyLink) {
            company = anyLink.textContent.trim();
          }
        }
      }
    }
    
    if (company) {
      // Clean up company name
      company = company.replace(/^[^\w\s]+\s*/, '').replace(/\s+/g, ' ').trim();
      lead.company = company;
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
    
  } catch (error) {
    console.error('Error extracting lead data:', error);
  }
  
  return lead;
}

function markProfileAsExtracted(container, success) {
  // Mark as processed
  container.setAttribute('data-extractor-processed', 'true');
  
  // Add visual marker
  const existingMarker = container.querySelector('.extractor-marker');
  if (existingMarker) {
    existingMarker.remove();
  }
  
  const marker = document.createElement('div');
  marker.className = 'extractor-marker';
  marker.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: ${success ? '#28a745' : '#dc3545'};
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
  marker.textContent = success ? '✓' : '✗';
  marker.title = success ? 'Lead extracted successfully' : 'Failed to extract - missing required data';
  
  // Make container relative if needed
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
    
    // Scroll to pagination area
    const paginationElement = document.querySelector('.artdeco-pagination');
    if (paginationElement) {
      paginationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Find current page number
    const currentPageElement = document.querySelector('[aria-current="true"]');
    let nextPageNum = 2;
    
    if (currentPageElement) {
      const currentPageNum = parseInt(currentPageElement.textContent);
      nextPageNum = currentPageNum + 1;
      console.log(`📄 Current page: ${currentPageNum}, looking for page: ${nextPageNum}`);
    }
    
    // Find next page button
    let nextButton = document.querySelector(`[data-test-pagination-page-btn="${nextPageNum}"] button`);
    
    if (!nextButton) {
      nextButton = document.querySelector('button[aria-label="Next"]:not([disabled])');
    }
    
    if (!nextButton || nextButton.disabled) {
      console.log('❌ No next page button found');
      return false;
    }
    
    console.log(`✅ Found next page button for page ${nextPageNum}`);
    
    // Click the button
    nextButton.click();
    
    console.log('🔄 Clicked next page, waiting for load...');
    
    // Wait for new page to load
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

async function extractLeadsWithProfileMarking(currentPage) {
  const allLeads = [];
  
  console.log(`🔍 Starting profile-by-profile marking for page ${currentPage}`);
  
  // Start from top
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  let lastProfileCount = 0;
  let stableCount = 0;
  let totalProcessed = 0;
  
  while (stableCount < 3) {
    // Get all profile containers (including newly loaded ones)
    const profileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    console.log(`📋 Found ${profileContainers.length} total profiles (${profileContainers.length - lastProfileCount} new)`);
    
    // Process new profiles only
    for (let i = lastProfileCount; i < profileContainers.length; i++) {
      const container = profileContainers[i];
      
      try {
        // Skip if already processed
        if (container.getAttribute('data-extractor-processed')) {
          continue;
        }
        
        // Scroll to profile to trigger loading
        container.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // Wait for lazy loading
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Extract lead data
        const leadElement = container.querySelector('[data-x-search-result="LEAD"]');
        
        if (leadElement) {
          const lead = extractLeadFromElement(leadElement);
          
          if (lead && lead.firstName && lead.lastName && lead.company) {
            allLeads.push(lead);
            markProfileAsExtracted(container, true);
            console.log(`✓ ${totalProcessed + 1}: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
          } else {
            // Show exactly what's missing
            const missingData = [];
            if (!lead || !lead.firstName) missingData.push('firstName');
            if (!lead || !lead.lastName || lead.lastName === 'Unknown') missingData.push('lastName');  
            if (!lead || !lead.company) missingData.push('company');
            
            markProfileAsExtracted(container, false);
            console.log(`❌ ${totalProcessed + 1}: Missing ${missingData.join(', ')} | Found: ${lead?.firstName || 'none'} ${lead?.lastName || 'none'} - ${lead?.company || 'none'}`);
          }
        } else {
          markProfileAsExtracted(container, false);
          console.log(`❌ ${totalProcessed + 1}: No lead element found in container`);
        }
        
        totalProcessed++;
        updateExtractionCount(allLeads.length);
        
      } catch (error) {
        console.error(`Error processing profile ${i + 1}:`, error);
        markProfileAsExtracted(container, false);
      }
    }
    
    lastProfileCount = profileContainers.length;
    
    // Scroll down to potentially load more profiles
    const scrollAmount = window.innerHeight * 0.6;
    window.scrollBy(0, scrollAmount);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for new profiles
    const newProfileContainers = document.querySelectorAll('li.artdeco-list__item');
    
    if (newProfileContainers.length > profileContainers.length) {
      console.log(`📋 Loaded ${newProfileContainers.length - profileContainers.length} more profiles`);
      stableCount = 0;
    } else {
      stableCount++;
      console.log(`🔄 No new profiles loaded. Stable count: ${stableCount}/3`);
    }
    
    // Check if we've reached pagination
    const paginationVisible = document.querySelector('.artdeco-pagination')?.getBoundingClientRect();
    if (paginationVisible && paginationVisible.top < window.innerHeight) {
      console.log('📄 Reached pagination area');
      break;
    }
  }
  
  console.log(`✅ Page ${currentPage} complete: ${allLeads.length} leads from ${totalProcessed} profiles processed`);
  return allLeads;
}

function extractLeadFromElement(element) {
  const lead = {};
  
  try {
    // Extract name
    const nameElement = element.querySelector('span[data-anonymize="person-name"]');
    if (nameElement) {
      const fullName = nameElement.textContent.trim();
      
      // Clean up name
      const cleanName = fullName
        .replace(/,?\s*(ChFC®|CLU®|CAP®|PhD|MBA|CPA|Esq\.?|Jr\.?|Sr\.?|III|II|IV)\s*/gi, '')
        .replace(/\s+Advising.*$/gi, '')
        .trim();
      
      const nameParts = cleanName.split(' ').filter(part => part.length > 0);
      
      if (nameParts.length >= 2) {
        lead.firstName = nameParts[0];
        lead.lastName = nameParts.slice(1).join(' ');
      } else if (nameParts.length === 1) {
        lead.firstName = nameParts[0];
        lead.lastName = 'Unknown';
      }
    }
    
    // Extract title
    const titleElement = element.querySelector('span[data-anonymize="title"]');
    if (titleElement) {
      lead.title = titleElement.textContent.trim();
    }
    
    // Extract company with multiple methods
    let company = '';
    
    // Method 1: Company link
    const companyElement = element.querySelector('a[data-anonymize="company-name"]');
    if (companyElement) {
      company = companyElement.textContent.trim();
    }
    
    // Method 2: Parse subtitle if no company link
    if (!company) {
      const subtitleElement = element.querySelector('.artdeco-entity-lockup__subtitle');
      if (subtitleElement) {
        const text = subtitleElement.textContent;
        // Look for company after bullet point
        const parts = text.split('•').map(p => p.trim());
        if (parts.length > 1) {
          company = parts[1];
        } else {
          // Look for any link in subtitle
          const anyLink = subtitleElement.querySelector('a');
          if (anyLink) {
            company = anyLink.textContent.trim();
          }
        }
      }
    }
    
    if (company) {
      // Clean up company name
      company = company.replace(/^[^\w\s]+\s*/, '').replace(/\s+/g, ' ').trim();
      lead.company = company;
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
    
  } catch (error) {
    console.error('Error extracting lead data:', error);
  }
  
  return lead;
}

function markProfileAsExtracted(container, success) {
  // Mark as processed
  container.setAttribute('data-extractor-processed', 'true');
  
  // Add visual marker
  const existingMarker = container.querySelector('.extractor-marker');
  if (existingMarker) {
    existingMarker.remove();
  }
  
  const marker = document.createElement('div');
  marker.className = 'extractor-marker';
  marker.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: ${success ? '#28a745' : '#dc3545'};
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
  marker.textContent = success ? '✓' : '✗';
  marker.title = success ? 'Lead extracted successfully' : 'Failed to extract - missing required data';
  
  // Make container relative if needed
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

// Progress indicator functions
function addProgressIndicator() {
  removeProgressIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'linkedin-extractor-progress';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #0073b1;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    min-width: 300px;
  `;
  
  indicator.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">🚀 LinkedIn Lead Extraction</div>
    <div id="progress-text">Preparing...</div>
    <div style="background: rgba(255,255,255,0.3); height: 6px; border-radius: 3px; margin-top: 8px;">
      <div id="progress-bar" style="background: white; height: 100%; border-radius: 3px; width: 0%; transition: width 0.5s;"></div>
    </div>
    <div style="font-size: 11px; margin-top: 5px; opacity: 0.9;" id="progress-details">Starting...</div>
    <div style="font-size: 12px; margin-top: 3px; font-weight: bold; color: #90EE90;" id="extraction-count">Leads found: 0</div>
  `;
  
  document.body.appendChild(indicator);
}

function updateProgressIndicator(currentPage, maxPages, details) {
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  const progressDetails = document.getElementById('progress-details');
  
  if (progressText && progressBar && progressDetails) {
    progressText.textContent = `Page ${currentPage} of ${maxPages}`;
    progressBar.style.width = `${(currentPage / maxPages) * 100}%`;
    progressDetails.textContent = details || 'Processing...';
  }
}

function updateExtractionCount(count) {
  const extractionCount = document.getElementById('extraction-count');
  if (extractionCount) {
    extractionCount.textContent = `Leads found: ${count}`;
  }
}

function removeProgressIndicator() {
  const indicator = document.getElementById('linkedin-extractor-progress');
  if (indicator) {
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
  indicator.textContent = '✅ LinkedIn Extractor Ready - Profile marking enabled';
  
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