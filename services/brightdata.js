const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    this.baseURL = 'https://api.brightdata.com/request';
    
    console.log('🔧 Bright Data service initialized with API key:', this.apiKey ? 'Present' : 'Missing');
  }

  async findDomain(companyName) {
    console.log(`🌐 Finding domain for company: ${companyName}`);
    
    try {
      const searchQuery = `"${companyName}" website`;
      console.log(`🔍 Searching Google for: ${searchQuery}`);
      
      const response = await axios.post(this.baseURL, {
        url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
        zone: 'domain_finder',
        country: 'US',
        format: 'html' // Use HTML to get actual page content, not JSON
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`📊 Bright Data domain response status: ${response.status}`);
      
      if (response.data) {
        console.log(`📄 Received search results HTML (${response.data.length} chars)`);
        
        const domain = this.extractDomainFromHTML(response.data, companyName);
        
        if (domain) {
          console.log(`✅ REAL domain found for ${companyName}: ${domain}`);
          return domain;
        } else {
          console.log(`❌ No valid domain found in search results for ${companyName}`);
        }
      } else {
        console.log(`❌ No search results returned for ${companyName}`);
      }
      
    } catch (error) {
      console.error(`❌ Bright Data domain error for ${companyName}:`, error.message);
      if (error.response) {
        console.log('Domain search error details:', error.response.data);
      }
    }
    
    // NO FALLBACK - return null if no real domain found
    console.log(`❌ No domain found for ${companyName} - will not process further`);
    return null;
  }

  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO for ${companyName} (${domain})`);
    
    // Use the EXACT format from your Python script: "CEO of company domain"
    const query = `CEO of ${companyName} ${domain}`;
    
    try {
      console.log(`🔍 CEO search query: ${query}`);
      
      const response = await axios.post(this.baseURL, {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        zone: 'domain_finder',
        country: 'US',
        format: 'html' // Use HTML to get actual page content with AI snippets
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`📊 Bright Data CEO response status: ${response.status}`);
      
      if (response.data) {
        console.log(`📄 Received CEO search HTML (${response.data.length} chars)`);
        
        // Extract visible text from HTML (like your Python script does)
        const searchText = this.extractVisibleTextFromHTML(response.data);
        
        if (searchText && searchText.length > 400) {
          console.log(`✅ CEO search results found for ${companyName} (${searchText.length} chars visible text)`);
          return searchText.substring(0, 2000); // Limit for OpenAI
        } else {
          console.log(`❌ Insufficient CEO search results for ${companyName} (${searchText?.length || 0} chars)`);
        }
      } else {
        console.log(`❌ No CEO search results returned for ${companyName}`);
      }
      
    } catch (error) {
      console.error(`❌ Bright Data CEO error for ${companyName}:`, error.message);
      if (error.response) {
        console.log('CEO search error details:', error.response.data);
      }
    }
    
    console.log(`❌ No CEO search results found for ${companyName}`);
    return '';
  }

  extractDomainFromHTML(html, companyName) {
    try {
      console.log(`🔍 Extracting domains from HTML for ${companyName}...`);
      
      // Look for actual website links in the HTML content
      const linkMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
      
      console.log(`📊 Found ${linkMatches.length} links in search results`);
      
      const companyWords = companyName.toLowerCase().split(' ').filter(w => w.length > 2);
      console.log(`🔍 Looking for domains containing: ${companyWords.join(', ')}`);
      
      for (const link of linkMatches) {
        const urlMatch = link.match(/href=["']([^"']+)["']/i);
        if (!urlMatch) continue;
        
        const url = urlMatch[1];
        
        try {
          const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
          let domain = urlObj.hostname.replace(/^www\./, '');
          
          // Filter out common non-company domains
          const excludeDomains = [
            'linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com', 'google.com',
            'instagram.com', 'indeed.com', 'glassdoor.com', 'crunchbase.com',
            'wikipedia.org', 'bloomberg.com', 'gstatic.com', 'googleadservices.com'
          ];
          
          if (excludeDomains.some(excluded => domain.includes(excluded))) {
            continue;
          }
          
          // Check if domain is relevant to company
          const domainText = domain.toLowerCase();
          const relevantWords = companyWords.filter(word => domainText.includes(word));
          
          if (relevantWords.length > 0) {
            console.log(`🎯 Found relevant domain: ${domain} (matches: ${relevantWords.join(', ')})`);
            return domain;
          }
          
        } catch (urlError) {
          // Skip invalid URLs
          continue;
        }
      }
      
      // Fallback: Look for any domain patterns in the text
      const textDomains = html.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
      
      for (const match of textDomains) {
        const domain = match.replace(/^https?:\/\//, '').replace(/^www\./, '');
        const domainText = domain.toLowerCase();
        
        const excludeDomains = [
          'linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com', 'google.com',
          'instagram.com', 'indeed.com', 'glassdoor.com', 'crunchbase.com',
          'wikipedia.org', 'bloomberg.com', 'gstatic.com', 'googleadservices.com'
        ];
        
        if (excludeDomains.some(excluded => domainText.includes(excluded))) {
          continue;
        }
        
        const relevantWords = companyWords.filter(word => domainText.includes(word));
        
        if (relevantWords.length > 0) {
          console.log(`🎯 Found relevant domain in text: ${domain} (matches: ${relevantWords.join(', ')})`);
          return domain;
        }
      }
      
      console.log(`❌ No relevant domains found for ${companyName}`);
      return null;
      
    } catch (error) {
      console.error('Error extracting domain from HTML:', error);
      return null;
    }
  }

  extractVisibleTextFromHTML(html) {
    try {
      // Remove HTML tags and extract visible text (like your Python script does with driver.text)
      let visibleText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Extract the main content area (usually contains search results and AI snippets)
      const contentIndicators = [
        'search results',
        'about',
        'results',
        'ceo',
        'chief executive',
        'president',
        'founder'
      ];
      
      // Look for sections that likely contain the information we need
      const sentences = visibleText.split('.').filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return contentIndicators.some(indicator => lowerSentence.includes(indicator));
      });
      
      if (sentences.length > 0) {
        visibleText = sentences.join('. ');
      }
      
      return visibleText;
      
    } catch (error) {
      console.error('Error extracting visible text from HTML:', error);
      return '';
    }
  }

  extractTextFromSearchResults(data) {
    try {
      // Handle both HTML and JSON responses
      if (typeof data === 'string') {
        // HTML response - extract visible text
        return this.extractVisibleTextFromHTML(data);
      } else {
        // JSON response - convert to text
        return JSON.stringify(data).substring(0, 2000);
      }
    } catch (error) {
      console.error('Error extracting text from search results:', error);
      return '';
    }
  }
}

module.exports = BrightDataService;