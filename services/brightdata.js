const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    this.baseURL = 'https://api.brightdata.com/datasets/v3';
  }

  async findDomain(companyName) {
    try {
      const response = await axios.post(`${this.baseURL}/trigger`, {
        dataset_id: 'gd_l7q7dkf244hwjntr5',
        query: `"${companyName}" domain`,
        limit: 10
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return this.extractDomainFromResults(response.data.results);
    } catch (error) {
      console.error('Bright Data domain error:', error);
      return null;
    }
  }

  async findCEO(domain, companyName) {
    const queries = this.buildCEOQueries(domain, companyName);
    
    for (const query of queries) {
      try {
        const response = await axios.post(`${this.baseURL}/trigger`, {
          dataset_id: 'gd_l7q7dkf244hwjntr5',
          query: query,
          limit: 15
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        const text = response.data.results
          ?.map(r => `${r.title} ${r.description}`)
          .join('\n') || '';
          
        if (text.length > 400) return text;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Bright Data CEO search error:', error);
      }
    }
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
    if (!results) return null;
    
    for (const result of results) {
      const text = ((result.title || '') + ' ' + (result.description || '')).toLowerCase();
      const domainMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      
      if (domainMatch) {
        let domain = domainMatch[1].replace('www.', '');
        const excludeDomains = ['linkedin.com', 'facebook.com', 'twitter.com'];
        if (!excludeDomains.some(excluded => domain.includes(excluded))) {
          return domain;
        }
      }
    }
    return null;
  }
}

module.exports = BrightDataService;