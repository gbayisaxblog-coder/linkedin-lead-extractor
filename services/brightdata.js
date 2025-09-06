const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    // Use the correct Bright Data API endpoint
    this.baseURL = 'https://api.brightdata.com/dca';
    
    console.log('🔧 Bright Data service initialized with API key:', this.apiKey ? 'Present' : 'Missing');
  }

  async findDomain(companyName) {
    console.log(`🌐 Finding domain for company: ${companyName}`);
    
    // Try multiple search strategies
    const searchQueries = this.buildDomainQueries(companyName);
    
    for (const query of searchQueries) {
      try {
        console.log(`🔍 Domain search query: "${query}"`);
        
        const response = await axios.post(`${this.baseURL}/trigger`, {
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          format: 'json'
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        console.log(`📊 Bright Data response status:`, response.status);
        
        if (response.data) {
          const domain = this.extractDomainFromGoogleResults(response.data, companyName);
          
          if (domain) {
            console.log(`✅ Domain found for ${companyName} with query "${query}": ${domain}`);
            return domain;
          }
        }
        
        // Small delay between queries
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Domain search error for query "${query}":`, error.message);
        if (error.response) {
          console.log('Error response data:', error.response.data);
          console.log('Error response status:', error.response.status);
        }
      }
    }
    
    // Fallback: Generate simple domain
    const fallbackDomain = this.generateFallbackDomain(companyName);
    console.log(`🔧 Using fallback domain for ${companyName}: ${fallbackDomain}`);
    return fallbackDomain;
  }

  buildDomainQueries(companyName) {
    const company = companyName.trim();
    
    return [
      `"${company}" website`,
      `"${company}" official site`,
      `${company} website`,
      `"${company}" site:.com`,
      `${company} official`
    ];
  }

  generateFallbackDomain(companyName) {
    // Generate a reasonable domain guess
    const cleanName = companyName
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+(inc|llc|ltd|corp|co|group|partners|solutions|services|technologies|systems|the|a|an)\s*/g, ' ')
      .trim()
      .replace(/\s+/g, '');
    
    return `${cleanName}.com`;
  }

  extractDomainFromGoogleResults(data, companyName) {
    try {
      // This will depend on the actual Bright Data response format
      // For now, analyze the response and extract domains
      const dataString = JSON.stringify(data).toLowerCase();
      
      // Look for domain patterns in the response
      const domainMatches = dataString.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
      
      if (domainMatches) {
        const companyWords = companyName.toLowerCase().split(' ').filter(w => w.length > 2);
        
        for (const match of domainMatches) {
          const domain = match.replace(/^https?:\/\//, '').replace(/^www\./, '');
          
          // Check if domain is relevant to company
          const domainText = domain.toLowerCase();
          const relevantWords = companyWords.filter(word => domainText.includes(word));
          
          if (relevantWords.length > 0) {
            console.log(`🎯 Found relevant domain: ${domain}`);
            return domain;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting domain from results:', error);
      return null;
    }
  }

  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO for ${companyName} (${domain})`);
    
    const queries = this.buildCEOQueries(domain, companyName);
    
    for (const query of queries) {
      try {
        console.log(`🔍 CEO search query: ${query}`);
        
        const response = await axios.post(`${this.baseURL}/trigger`, {
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          format: 'json'
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        if (response.data) {
          const text = JSON.stringify(response.data).substring(0, 2000);
          
          if (text.length > 100) {
            console.log(`✅ CEO search results found for ${query} (${text.length} chars)`);
            return text;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ CEO search error for query "${query}":`, error.message);
      }
    }
    
    console.log(`❌ No CEO search results found for ${companyName}`);
    return '';
  }

  buildCEOQueries(domain, companyName) {
    const company = (companyName || '').trim();
    
    if (company) {
      return [
        `CEO of ${company}`,
        `${company} CEO`,
        `${company} founder`,
        `site:${domain} CEO`,
        `site:${domain} founder`
      ];
    } else {
      return [
        `CEO of ${domain}`,
        `site:${domain} CEO`,
        `${domain} CEO`
      ];
    }
  }
}

module.exports = BrightDataService;