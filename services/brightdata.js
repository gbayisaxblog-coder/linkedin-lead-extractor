const axios = require('axios');

class BrightDataService {
  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY;
    this.baseURL = 'https://api.brightdata.com/datasets/v3';
    
    console.log('🔧 Bright Data service initialized');
  }

  async findDomain(companyName) {
    console.log(`🌐 Finding domain for company: ${companyName}`);
    
    // Try multiple search strategies
    const searchQueries = this.buildDomainQueries(companyName);
    
    for (const query of searchQueries) {
      try {
        console.log(`🔍 Domain search query: "${query}"`);
        
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

        if (response.data.results && response.data.results.length > 0) {
          console.log(`📊 Found ${response.data.results.length} search results for "${query}"`);
          
          // Analyze all results to find the best match
          const domain = this.analyzResultsForBestDomain(response.data.results, companyName);
          
          if (domain) {
            console.log(`✅ Domain found for ${companyName} with query "${query}": ${domain}`);
            return domain;
          }
        } else {
          console.log(`❌ No search results for query: "${query}"`);
        }
        
        // Small delay between queries
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Domain search error for query "${query}":`, error.message);
      }
    }
    
    console.log(`❌ No domain found for ${companyName} after trying ${searchQueries.length} queries`);
    return null;
  }

  buildDomainQueries(companyName) {
    const company = companyName.trim();
    
    return [
      // Most specific first
      `"${company}" website`,
      `"${company}" official site`,
      `"${company}"`,
      
      // Without quotes for broader results
      `${company} website`,
      `${company} official`,
      
      // With common domain extensions
      `"${company}" site:.com`,
      
      // Cleaned company name
      `"${this.cleanCompanyName(company)}" website`
    ];
  }

  cleanCompanyName(company) {
    return company
      .replace(/\s+(Inc|LLC|Ltd|Corp|Co|Group|Partners|Solutions|Services|Technologies|Systems)\.?$/i, '')
      .replace(/\s+(The|A|An)\s+/gi, ' ')
      .trim();
  }

  analyzResultsForBestDomain(results, companyName) {
    console.log(`🔍 Analyzing ${results.length} results for ${companyName}:`);
    
    const companyWords = companyName.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(' ')
      .filter(w => w.length > 2); // Only words longer than 2 chars
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const title = (result.title || '').toLowerCase();
      const description = (result.description || '').toLowerCase();
      const url = (result.url || '').toLowerCase();
      
      console.log(`📄 Result ${i + 1}:`);
      console.log(`   Title: ${result.title}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Description: ${(result.description || '').substring(0, 100)}...`);
      
      // Calculate relevance score
      const combinedText = `${title} ${description}`;
      let score = 0;
      
      // Score based on company words appearing in title/description
      for (const word of companyWords) {
        if (title.includes(word)) score += 3; // Title matches are most important
        if (description.includes(word)) score += 1; // Description matches
        if (url.includes(word)) score += 2; // URL matches are important
      }
      
      // Bonus for being first result
      if (i === 0) score += 2;
      
      // Extract domain from this result
      const domain = this.extractDomainFromURL(result.url);
      
      if (domain) {
        console.log(`   Domain: ${domain}, Score: ${score}`);
        
        if (score > bestScore) {
          bestMatch = { domain, score, result };
          bestScore = score;
        }
      } else {
        console.log(`   No valid domain found in URL`);
      }
    }
    
    if (bestMatch) {
      console.log(`🎯 Best match: ${bestMatch.domain} (score: ${bestMatch.score})`);
      console.log(`   From: ${bestMatch.result.title}`);
      return bestMatch.domain;
    }
    
    console.log(`❌ No suitable domain found for ${companyName}`);
    return null;
  }

  extractDomainFromURL(url) {
    if (!url) return null;
    
    try {
      // Handle URLs with or without protocol
      const urlToProcess = url.startsWith('http') ? url : `https://${url}`;
      const urlObj = new URL(urlToProcess);
      let domain = urlObj.hostname;
      
      // Remove www prefix
      domain = domain.replace(/^www\./, '');
      
      // Filter out non-company domains
      const excludeDomains = [
        'linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com', 'google.com',
        'instagram.com', 'indeed.com', 'glassdoor.com', 'crunchbase.com',
        'wikipedia.org', 'bloomberg.com', 'reuters.com'
      ];
      
      if (excludeDomains.some(excluded => domain.includes(excluded))) {
        return null;
      }
      
      return domain;
    } catch (error) {
      // Fallback: try regex extraction
      const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return domainMatch ? domainMatch[1].replace('www.', '') : null;
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
        `CEO of ${company}`,
        `${company} CEO`,
        `${company} founder`,
        `${company} president`,
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