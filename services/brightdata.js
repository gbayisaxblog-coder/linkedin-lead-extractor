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
      console.log(`🔍 Searching Google for: "${companyName}" website`);
      
      const response = await axios.post(this.baseURL, {
        url: `https://www.google.com/search?q="${companyName}" website`,
        country: 'US',
        format: 'json'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`📊 Bright Data domain response status: ${response.status}`);
      
      if (response.data) {
        const domain = this.extractDomainFromSearchResults(response.data, companyName);
        
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
    
    // Use the EXACT same query format as your Python script
    const query = `CEO of ${companyName} ${domain}`;
    
    try {
      console.log(`🔍 CEO search query: ${query}`);
      
      const response = await axios.post(this.baseURL, {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        country: 'US',
        format: 'json'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`📊 Bright Data CEO response status: ${response.status}`);
      
      if (response.data) {
        const searchText = this.extractTextFromSearchResults(response.data);
        
        if (searchText && searchText.length > 400) {
          console.log(`✅ CEO search results found for ${companyName} (${searchText.length} chars)`);
          return searchText;
        } else {
          console.log(`❌ Insufficient CEO search results for ${companyName}`);
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

  extractDomainFromSearchResults(data, companyName) {
    try {
      console.log(`🔍 Analyzing search results for ${companyName}...`);
      
      // Convert search results to text and look for domains
      const resultsText = JSON.stringify(data).toLowerCase();
      const domainMatches = resultsText.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
      
      if (!domainMatches) {
        console.log(`❌ No domain patterns found in search results`);
        return null;
      }
      
      console.log(`📊 Found ${domainMatches.length} potential domains in search results`);
      
      const companyWords = companyName.toLowerCase().split(' ').filter(w => w.length > 2);
      console.log(`🔍 Looking for domains containing: ${companyWords.join(', ')}`);
      
      for (const match of domainMatches) {
        const domain = match.replace(/^https?:\/\//, '').replace(/^www\./, '');
        const domainText = domain.toLowerCase();
        
        // Filter out common non-company domains
        const excludeDomains = [
          'linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com', 'google.com',
          'instagram.com', 'indeed.com', 'glassdoor.com', 'crunchbase.com',
          'wikipedia.org', 'bloomberg.com'
        ];
        
        if (excludeDomains.some(excluded => domainText.includes(excluded))) {
          console.log(`⏭️ Skipping excluded domain: ${domain}`);
          continue;
        }
        
        // Check if domain is relevant to company
        const relevantWords = companyWords.filter(word => domainText.includes(word));
        
        if (relevantWords.length > 0) {
          console.log(`🎯 Found relevant domain: ${domain} (matches: ${relevantWords.join(', ')})`);
          return domain;
        } else {
          console.log(`⏭️ Domain not relevant: ${domain} (no company word matches)`);
        }
      }
      
      console.log(`❌ No relevant domains found for ${companyName}`);
      return null;
      
    } catch (error) {
      console.error('Error extracting domain from results:', error);
      return null;
    }
  }

  extractTextFromSearchResults(data) {
    try {
      // Extract text content from search results like your Python script does
      let searchText = '';
      
      if (typeof data === 'object') {
        searchText = JSON.stringify(data);
      } else {
        searchText = String(data);
      }
      
      // Clean up and limit size for OpenAI (like your Python script)
      searchText = searchText.substring(0, 2000);
      
      return searchText;
    } catch (error) {
      console.error('Error extracting text from search results:', error);
      return '';
    }
  }
}

module.exports = BrightDataService;