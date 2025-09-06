chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractLeads') {
    try {
      const leads = extractLinkedInLeads();
      sendResponse({ success: true, leads });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
});

function extractLinkedInLeads() {
  const leads = [];
  
  const selectors = {
    salesNavigator: '.artdeco-entity-lockup__content',
    regular: '.reusable-search__result-container',
    recruiter: '.search-results__result-item'
  };
  
  let leadElements = [];
  
  for (const [type, selector] of Object.entries(selectors)) {
    leadElements = document.querySelectorAll(selector);
    if (leadElements.length > 0) {
      console.log(`Found ${leadElements.length} leads using ${type} selector`);
      break;
    }
  }
  
  if (leadElements.length === 0) {
    throw new Error('No LinkedIn search results found on this page');
  }
  
  leadElements.forEach((element, index) => {
    try {
      const lead = extractLeadFromElement(element);
      if (lead && lead.firstName && lead.lastName) {
        leads.push(lead);
      }
    } catch (error) {
      console.error(`Error extracting lead ${index}:`, error);
    }
  });
  
  if (leads.length === 0) {
    throw new Error('No valid leads could be extracted from this page');
  }
  
  return leads;
}

function extractLeadFromElement(element) {
  const lead = {};
  
  const nameSelectors = [
    '.artdeco-entity-lockup__title a',
    '.actor-name',
    '.search-result__result-link',
    '.artdeco-entity-lockup__title span[aria-hidden="true"]'
  ];
  
  let nameElement = null;
  for (const selector of nameSelectors) {
    nameElement = element.querySelector(selector);
    if (nameElement) break;
  }
  
  if (nameElement) {
    const fullName = nameElement.textContent.trim();
    const nameParts = fullName.split(' ');
    
    if (nameParts.length >= 2) {
      lead.firstName = nameParts[0];
      lead.lastName = nameParts.slice(1).join(' ');
    } else {
      lead.firstName = fullName;
      lead.lastName = '';
    }
  }
  
  const companySelectors = [
    '.artdeco-entity-lockup__subtitle',
    '.subline-level-1',
    '.search-result__snippets .t-14'
  ];
  
  let companyElement = null;
  for (const selector of companySelectors) {
    companyElement = element.querySelector(selector);
    if (companyElement) break;
  }
  
  if (companyElement) {
    lead.company = companyElement.textContent.trim().replace(/^at\s+/i, '');
  }
  
  const linkElement = element.querySelector('a[href*="/in/"], a[href*="/pub/"]');
  if (linkElement) {
    lead.linkedinUrl = linkElement.href;
  }
  
  return lead;
}

// Add indicator when page loads
function addExtractionIndicator() {
  if (document.getElementById('linkedin-extractor-indicator')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'linkedin-extractor-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #0073b1;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  indicator.textContent = '🚀 LinkedIn Extractor Ready';
  
  document.body.appendChild(indicator);
  
  setTimeout(() => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addExtractionIndicator);
} else {
  addExtractionIndicator();
}