const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    this.baseURL = 'https://api.brightdata.com/request';
    
    console.log('🔧 Bright Data service initialized');
  }

  async findDomain(companyName) {
    console.log(`🌐 Finding domain for: ${companyName}`);
    
    try {
      const searchQuery = `"${companyName}" website`;
      
      const response = await axios.post(this.baseURL, {
        url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
        zone: 'domain_finder',
        country: 'US',
        format: 'html'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data && response.status === 200) {
        const domain = this.extractDomainFromHTML(response.data, companyName);
        
        if (domain) {
          console.log(`✅ Domain found: ${companyName} → ${domain}`);
          return domain;
        }
      }
      
    } catch (error) {
      console.error(`❌ Domain search failed for ${companyName}: ${error.message}`);
    }
    
    console.log(`❌ No domain found for: ${companyName}`);
    return null;
  }

  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO: ${companyName} (${domain})`);
    
    // Use EXACT format: "CEO of company domain"
    const query = `CEO of ${companyName} ${domain}`;
    
    try {
      const response = await axios.post(this.baseURL, {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        zone: 'domain_finder',
        country: 'US',
        format: 'html'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data && response.status === 200) {
        const searchText = this.extractVisibleTextFromHTML(response.data);
        
        if (searchText && searchText.length > 400) {
          console.log(`✅ CEO search results found for ${companyName} (${searchText.length} chars)`);
          return searchText.substring(0, 2000);
        }
      }
      
    } catch (error) {
      console.error(`❌ CEO search failed for ${companyName}: ${error.message}`);
    }
    
    console.log(`❌ No CEO results for: ${companyName}`);
    return '';
  }

  extractDomainFromHTML(html, companyName) {
    try {
      // Extract website links from search results
      const linkPattern = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
      const domains = new Set();
      let match;
      
      while ((match = linkPattern.exec(html)) !== null) {
        const url = match[1];
        
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace(/^www\./, '');
          
          // Filter out non-company domains
          const excludeDomains = [
            'google.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com',
            'instagram.com', 'wikipedia.org', 'crunchbase.com', 'glassdoor.com'
          ];
          
          if (!excludeDomains.some(excluded => domain.includes(excluded))) {
            domains.add(domain);
          }
        } catch (urlError) {
          // Skip invalid URLs
        }
      }
      
      const domainArray = Array.from(domains);
      
      if (domainArray.length === 0) {
        return null;
      }
      
      // Find most relevant domain
      const companyWords = companyName.toLowerCase().split(' ').filter(w => w.length > 2);
      
      // First, look for exact matches
      for (const domain of domainArray) {
        const domainText = domain.toLowerCase();
        const matchCount = companyWords.filter(word => domainText.includes(word)).length;
        
        if (matchCount > 0) {
          console.log(`🎯 Relevant domain: ${domain} (${matchCount} matches)`);
          return domain;
        }
      }
      
      // If no matches, return first domain (likely the company's main site)
      console.log(`🔧 Using first domain: ${domainArray[0]}`);
      return domainArray[0];
      
    } catch (error) {
      console.error('Domain extraction error:', error);
      return null;
    }
  }

  extractVisibleTextFromHTML(html) {
    try {
      // Extract visible text like your Python script
      let visibleText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Focus on CEO-related content
      const ceoKeywords = ['ceo', 'chief executive', 'president', 'founder', 'executive director'];
      const sentences = visibleText.split('.').filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return ceoKeywords.some(keyword => lowerSentence.includes(keyword)) && sentence.length > 20;
      });
      
      if (sentences.length > 0) {
        // Return the most relevant sentences
        const relevantText = sentences.slice(0, 8).join('. ');
        console.log(`📄 Extracted ${sentences.length} CEO-related sentences`);
        return relevantText;
      }
      
      // Fallback: return first part of text
      return visibleText.substring(0, 1500);
      
    } catch (error) {
      console.error('Text extraction error:', error);
      return '';
    }
  }
}

module.exports = BrightDataService;