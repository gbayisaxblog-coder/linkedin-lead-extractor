// services/datablist.js - NEW DATABLIST DOMAIN SERVICE
const axios = require('axios');

class DatablistService {
  constructor() {
    this.apiKey = process.env.DATABLIST_API_KEY;
    this.baseURL = 'https://api.datablist.com/v1';
    
    console.log('🔧 Datablist service initialized');
  }

  async findDomain(companyName) {
    console.log(`🌐 Datablist: Finding domain for: ${companyName}`);
    
    try {
      // Use Datablist's company domain enrichment API
      const response = await axios.post(`${this.baseURL}/enrichments/company-domain`, {
        data: [
          {
            company_name: companyName
          }
        ],
        settings: {
          workflow: 'database_with_google_fallback', // Use both database and Google
          target_country: 'US',
          accept_non_root_websites: false, // Avoid directories
          skip_domains: 'crunchbase.com,linkedin.com,facebook.com,amazon.com,ebay.com,w3.org,wikipedia.org,github.com,support.google.com,pic.x.com,bit.ly'
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        
        if (result.status === 'success' && result.company_domain) {
          console.log(`✅ Datablist found domain: ${companyName} → ${result.company_domain}`);
          return result.company_domain;
        } else {
          console.log(`❌ Datablist: No domain found for ${companyName} (status: ${result.status})`);
          return null;
        }
      }
      
      console.log(`❌ Datablist: Invalid response format for ${companyName}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Datablist error for ${companyName}:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return null;
    }
  }
}

module.exports = DatablistService;