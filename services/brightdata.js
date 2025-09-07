const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    this.baseURL = 'https://api.brightdata.com/dca';
    
    if (!this.apiKey) {
      throw new Error('BRIGHTDATA_API_KEY is required');
    }
    
    console.log('🔧 Bright Data service initialized with API key: Present');
  }
  
  async findDomain(companyName) {
    try {
      console.log(`🌐 Finding domain for company: ${companyName}`);
      
      const searchQuery = `"${companyName}" website`;
      console.log(`🔍 Domain search query: ${searchQuery}`);
      
      const requestConfig = {
        method: 'GET',
        url: this.baseURL,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
          format: 'html'
        },
        timeout: 30000
      };
      
      console.log('📡 Making Bright Data request...');
      const response = await axios(requestConfig);
      
      if (response.status === 200 && response.data) {
        console.log('✅ Bright Data response received');
        
        const domain = this.extractDomainFromHTML(response.data, companyName);
        
        if (domain) {
          console.log(`✅ Domain found: ${domain}`);
          return domain;
        } else {
          console.log(`❌ No domain found for: ${companyName}`);
          return null;
        }
      } else {
        console.error('❌ Unexpected Bright Data response:', response.status);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Domain search error for "${companyName}":`, error.message);
      
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
      
      return null;
    }
  }
  
  async findCEO(companyName, domain) {
    try {
      console.log(`👔 Finding CEO for ${companyName} (${domain})`);
      
      const searchQuery = `CEO of ${companyName}`;
      console.log(`🔍 CEO search query: ${searchQuery}`);
      
      const requestConfig = {
        method: 'GET',
        url: this.baseURL,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
          format: 'html'
        },
        timeout: 30000
      };
      
      console.log('📡 Making Bright Data CEO search...');
      const response = await axios(requestConfig);
      
      if (response.status === 200 && response.data) {
        console.log('✅ Bright Data CEO response received');
        
        const visibleText = this.extractVisibleTextFromHTML(response.data);
        return visibleText;
      } else {
        console.error('❌ Unexpected Bright Data CEO response:', response.status);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ CEO search error for "${companyName}":`, error.message);
      return null;
    }
  }
  
  extractDomainFromHTML(html, companyName) {
    try {
      console.log('🔍 Extracting domain from HTML response...');
      
      const domainRegex = /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g;
      const domains = [];
      let match;
      
      while ((match = domainRegex.exec(html)) !== null) {
        const domain = match[1].toLowerCase();
        
        if (!this.isCommonDomain(domain) && this.isDomainRelevant(domain, companyName)) {
          domains.push(domain);
        }
      }
      
      if (domains.length > 0) {
        const bestDomain = domains[0];
        console.log(`🎯 Selected domain: ${bestDomain} from ${domains.length} candidates`);
        return bestDomain;
      }
      
      console.log('❌ No relevant domains found in HTML');
      return null;
      
    } catch (error) {
      console.error('❌ Error extracting domain from HTML:', error);
      return null;
    }
  }
  
  extractVisibleTextFromHTML(html) {
    try {
      // Remove script and style tags
      let cleanText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Limit text length for OpenAI processing
      if (cleanText.length > 3000) {
        cleanText = cleanText.substring(0, 3000);
      }
      
      return cleanText;
    } catch (error) {
      console.error('❌ Error extracting visible text:', error);
      return '';
    }
  }
  
  isCommonDomain(domain) {
    const commonDomains = [
      'google.com', 'facebook.com', 'twitter.com', 'linkedin.com', 'youtube.com',
      'instagram.com', 'wikipedia.org', 'amazon.com', 'apple.com', 'microsoft.com',
      'github.com', 'stackoverflow.com', 'reddit.com', 'medium.com', 'wordpress.com'
    ];
    
    return commonDomains.some(common => domain.includes(common));
  }
  
  isDomainRelevant(domain, companyName) {
    try {
      const companyWords = companyName.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !['inc', 'llc', 'corp', 'ltd', 'company', 'the', 'and', 'for', 'with'].includes(word));
      
      const domainParts = domain.toLowerCase().split('.');
      
      return companyWords.some(word => 
        domainParts.some(part => part.includes(word) || word.includes(part))
      );
    } catch (error) {
      return false;
    }
  }
}

module.exports = BrightDataService;