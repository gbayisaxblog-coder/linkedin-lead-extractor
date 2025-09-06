console.log('🚀 [CONTENT] LinkedIn Lead Extractor v2.0 loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 [CONTENT] Message received:', request.action);
  
  if (request.action === 'extractLeads') {
    const maxPages = request.maxPages || 1;
    console.log(`🚀 [CONTENT] Starting extraction for ${maxPages} pages`);
    
    (async () => {
      try {
        const result = await extractLeadsBulletproof(maxPages);
        
        console.log('📤 [CONTENT] Sending results:', {
          success: true,
          leadsCount: result.leads.length,
          pagesProcessed: result.pagesProcessed
        });
        
        sendResponse({ 
          success: true, 
          leads: result.leads,
          leadsCount: result.leads.length,
          pagesProcessed: result.pagesProcessed
        });
        
        console.log('✅ [CONTENT] Response sent successfully');
        
      } catch (error) {
        console.error('❌ [CONTENT] Extraction error:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          leads: [],
          leadsCount: 0
        });
      }
    })();
    
    return true;
  }
  
  return false;
});

async function extractLeadsBulletproof(maxPages = 1) {
  console.log(`[CONTENT] Starting bulletproof extraction for ${maxPages} pages`);
  
  const allLeads = [];
  let currentPage = 1;
  
  try {
    // Wait for page to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Scroll to load all content
    await scrollToLoadContent();
    
    // Find all profile containers
    const profiles = document.querySelectorAll('li.artdeco-list__item');
    console.log(`[CONTENT] Found ${profiles.length} profile containers`);
    
    if (profiles.length === 0) {
      console.log('[CONTENT] No profiles found - trying alternative selectors');
      const altProfiles = document.querySelectorAll('[data-view-name="search-entity-result-universal-template"]');
      console.log(`[CONTENT] Alternative selector found: ${altProfiles.length} profiles`);
    }
    
    for (let i = 0; i < profiles.length; i++) {
      const container = profiles[i];
      
      try {
        const lead = extractLeadBulletproof(container, i + 1);
        
        if (lead) {
          allLeads.push(lead);
          console.log(`[CONTENT] ✓ ${i + 1}: ${lead.fullName} - ${lead.company}`);
          
          // Add success marker
          addMarker(container, '✓', '#28a745');
        } else {
          console.log(`[CONTENT] ❌ ${i + 1}: Invalid data`);
          
          // Add failure marker
          addMarker(container, '✗', '#dc3545');
        }
        
      } catch (error) {
        console.error(`[CONTENT] Error processing profile ${i + 1}:`, error);
        addMarker(container, '✗', '#dc3545');
      }
    }
    
    console.log(`[CONTENT] Extraction complete: ${allLeads.length} valid leads from ${profiles.length} profiles`);
    
    return {
      leads: allLeads,
      pagesProcessed: 1
    };
    
  } catch (error) {
    console.error('[CONTENT] Extraction error:', error);
    throw error;
  }
}

function extractLeadBulletproof(container, index) {
  try {
    // Try multiple selectors for lead element
    const leadElement = container.querySelector('[data-x-search-result="LEAD"]') ||
                       container.querySelector('.entity-result') ||
                       container.querySelector('.search-entity-result-universal-template') ||
                       container;
    
    if (!leadElement) {
      console.log(`[CONTENT] ${index}: No lead element found`);
      return null;
    }
    
    // Extract name with multiple fallbacks
    let fullName = '';
    const nameSelectors = [
      'span[data-anonymize="person-name"]',
      '.entity-result__title-text a span[aria-hidden="true"]',
      '.entity-result__title-text span',
      'a[data-control-name="search_srp_result"] span[aria-hidden="true"]',
      '.artdeco-entity-lockup__title a span',
      'h3 a span'
    ];
    
    for (const selector of nameSelectors) {
      const nameEl = leadElement.querySelector(selector);
      if (nameEl && nameEl.textContent.trim()) {
        fullName = nameEl.textContent.trim();
        break;
      }
    }
    
    // Clean and validate name
    if (fullName) {
      fullName = fullName
        .replace(/[^\w\s\-'\.]/g, ' ') // Replace special chars with spaces
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    }
    
    if (!fullName || fullName.length < 2) {
      console.log(`[CONTENT] ${index}: No valid name found`);
      return null;
    }
    
    // Extract company with multiple fallbacks
    let company = '';
    const companySelectors = [
      'a[data-anonymize="company-name"]',
      '.entity-result__primary-subtitle',
      '.entity-result__secondary-subtitle',
      '.artdeco-entity-lockup__subtitle a',
      '.entity-result__summary .entity-result__primary-subtitle'
    ];
    
    for (const selector of companySelectors) {
      const companyEl = leadElement.querySelector(selector);
      if (companyEl && companyEl.textContent.trim()) {
        company = companyEl.textContent.trim();
        // Clean company name
        company = company
          .replace(/^at\s+/i, '') // Remove "at" prefix
          .replace(/\s+•.*$/, '') // Remove everything after bullet
          .trim();
        if (company && !company.includes('connection') && company.length > 1) {
          break;
        }
      }
    }
    
    // Clean and validate company
    if (company) {
      company = company
        .replace(/[^\w\s\-&'\.]/g, ' ') // Allow business chars
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    }
    
    if (!company || company.length < 2) {
      console.log(`[CONTENT] ${index}: No valid company found for ${fullName}`);
      return null;
    }
    
    // Extract optional fields
    let title = '';
    const titleEl = leadElement.querySelector('span[data-anonymize="title"]') ||
                   leadElement.querySelector('.entity-result__summary .entity-result__primary-subtitle');
    if (titleEl) {
      title = titleEl.textContent.trim();
    }
    
    let location = '';
    const locationEl = leadElement.querySelector('span[data-anonymize="location"]');
    if (locationEl) {
      location = locationEl.textContent.trim();
    }
    
    let linkedinUrl = '';
    const linkEl = leadElement.querySelector('a[data-control-name="search_srp_result"]') ||
                  leadElement.querySelector('.entity-result__title-text a') ||
                  leadElement.querySelector('h3 a');
    if (linkEl && linkEl.href) {
      linkedinUrl = linkEl.href;
    }
    
    const lead = {
      fullName: fullName.substring(0, 200),
      company: company.substring(0, 200),
      title: title.substring(0, 200),
      location: location.substring(0, 100),
      linkedinUrl: linkedinUrl.substring(0, 500),
      extractedAt: new Date().toISOString()
    };
    
    console.log(`[CONTENT] ${index}: Extracted - Name: "${lead.fullName}", Company: "${lead.company}"`);
    return lead;
    
  } catch (error) {
    console.error(`[CONTENT] Error extracting lead ${index}:`, error);
    return null;
  }
}

async function scrollToLoadContent() {
  console.log('[CONTENT] Scrolling to load all content...');
  
  const scrollHeight = document.body.scrollHeight;
  const viewportHeight = window.innerHeight;
  const scrollStep = viewportHeight * 0.8;
  
  for (let scrollTop = 0; scrollTop < scrollHeight; scrollTop += scrollStep) {
    window.scrollTo(0, scrollTop);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Final scroll to bottom and back to top
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(resolve => setTimeout(resolve, 1000));
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('[CONTENT] Scrolling complete');
}

function addMarker(container, symbol, color) {
  // Remove existing marker
  const existing = container.querySelector('.extraction-marker');
  if (existing) existing.remove();
  
  const marker = document.createElement('div');
  marker.className = 'extraction-marker';
  marker.textContent = symbol;
  marker.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: ${color};
    color: white;
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  `;
  
  container.style.position = 'relative';
  container.appendChild(marker);
}

console.log('✅ [CONTENT] Content script ready');