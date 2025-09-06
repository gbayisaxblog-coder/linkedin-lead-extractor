const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    this.baseURL = 'https://api.brightdata.com/datasets/v3';
    
    console.log('🔧 Bright Data service initialized');
  }

  async findDomain(companyName) {
    console.log(`🌐 Finding domain for company: ${companyName}`);
    
    try {
      const response = await axios.post(`${this.baseURL}/trigger`, {
        dataset_id: 'gd_l7q7dkf244hwjntr5',
        query: `"${companyName}" domain site:linkedin.com OR site:crunchbase.com`,
        limit: 10
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const domain = this.extractDomainFromResults(response.data.results);
      console.log(`✅ Domain found for ${companyName}: ${domain || 'none'}`);
      
      return domain;
    } catch (error) {
      console.error(`❌ Bright Data domain error for ${companyName}:`, error.message);
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
          dataset_id: 'gd_l7q7dkf244hwjntr5',
          query: query,
          limit: 15
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        const text = response.data.results
          ?.map(r => `${r.title} ${r.description}`)
          .join('\n') || '';
          
        if (text.length > 400) {
          console.log(`✅ CEO search results found for ${query} (${text.length} chars)`);
          return text;
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
        `CEO of ${company} ${domain}`,
        `CEO of ${company}`,
        `${company} leadership`,
        `${domain} CEO`
      ];
    } else {
      return [
        `CEO of ${domain}`,
        `site:${domain} CEO`,
        `${domain} CEO`
      ];
    }
  }

  extractDomainFromResults(results) {
    if (!results || !Array.isArray(results)) return null;
    
    for (const result of results) {
      const text = ((result.title || '') + ' ' + (result.description || '')).toLowerCase();
      const domainMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      
      if (domainMatch) {
        let domain = domainMatch[1].replace('www.', '');
        const excludeDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com'];
        if (!excludeDomains.some(excluded => domain.includes(excluded))) {
          return domain;
        }
      }
    }
    return null;
  }
}

module.exports = BrightDataService;