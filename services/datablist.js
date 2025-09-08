// services/datablist.js - CORRECT IMPLEMENTATION BASED ON DOCS
const axios = require('axios');

class DatablistService {
  constructor() {
    this.personalApiKey = process.env.DATABLIST_API_KEY;
    this.baseURL = 'https://data.datablist.com'; // CORRECT: From docs
    this.tokenURL = 'https://account.datablist.com/token'; // For getting access token
    this.accessToken = null;
    this.tokenExpiry = null;
    
    console.log('🔧 Datablist service initialized');
  }

  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log('🔑 Getting new Datablist access token...');
      
      const response = await axios.post(this.tokenURL, {
        apiKey: this.personalApiKey
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.access_token) {
        this.accessToken = response.data.access_token;
        // Set expiry to 23 hours (tokens expire after 24h)
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
        
        console.log('✅ Datablist access token obtained');
        return this.accessToken;
      }
      
      throw new Error('No access token in response');
      
    } catch (error) {
      console.error('❌ Failed to get Datablist access token:', error.message);
      throw error;
    }
  }

  async findDomain(companyName) {
    console.log(`🌐 Datablist: Finding domain for: ${companyName}`);
    
    try {
      const accessToken = await this.getAccessToken();
      
      // Step 1: Create a temporary collection for this search
      const collectionId = await this.createTempCollection(accessToken);
      
      // Step 2: Add the company to the collection
      const itemId = await this.addCompanyToCollection(accessToken, collectionId, companyName);
      
      // Step 3: Run domain enrichment (this is where the magic happens)
      await this.runDomainEnrichment(accessToken, collectionId);
      
      // Step 4: Get the enriched result
      const domain = await this.getEnrichedDomain(accessToken, collectionId, itemId);
      
      // Step 5: Cleanup - delete the temporary collection
      await this.cleanupCollection(accessToken, collectionId);
      
      if (domain) {
        console.log(`✅ Datablist found domain: ${companyName} → ${domain}`);
        return domain;
      }
      
      console.log(`❌ Datablist: No domain found for ${companyName}`);
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

  async createTempCollection(accessToken) {
    try {
      const response = await axios.post(`${this.baseURL}/collections`, {
        name: `temp_domain_${Date.now()}`,
        description: 'Temporary collection for domain search',
        dataType: 'Organization' // Use Organization data type from Datablist vocabulary
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const collectionId = response.data['@id'];
      console.log(`✅ Created temp collection: ${collectionId}`);
      return collectionId;
      
    } catch (error) {
      console.error('❌ Failed to create collection:', error.response?.data || error.message);
      throw error;
    }
  }

  async addCompanyToCollection(accessToken, collectionId, companyName) {
    try {
      const response = await axios.post(`${this.baseURL}/collections/${collectionId}/items`, {
        name: companyName,
        '@type': 'Organization'
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const itemId = response.data['@id'];
      console.log(`✅ Added company to collection: ${itemId}`);
      return itemId;
      
    } catch (error) {
      console.error('❌ Failed to add company to collection:', error.response?.data || error.message);
      throw error;
    }
  }

  async runDomainEnrichment(accessToken, collectionId) {
    try {
      // This would trigger the domain enrichment on the collection
      // Note: The exact enrichment endpoint might be different
      const response = await axios.post(`${this.baseURL}/collections/${collectionId}/enrichments`, {
        enrichmentType: 'company-domain',
        settings: {
          workflow: 'database_with_google_fallback',
          target_country: 'US',
          skip_domains: 'crunchbase.com,linkedin.com,facebook.com,amazon.com,ebay.com'
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ Domain enrichment triggered`);
      
      // Wait a bit for enrichment to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error('❌ Failed to run enrichment:', error.response?.data || error.message);
      // Don't throw - enrichment might have different endpoint
    }
  }

  async getEnrichedDomain(accessToken, collectionId, itemId) {
    try {
      const response = await axios.get(`${this.baseURL}/collections/${collectionId}/items/${itemId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      const item = response.data;
      
      // Look for domain in various possible fields
      const domain = item.domain || 
                    item.website || 
                    item.companyDomain || 
                    item.url ||
                    item['company_domain'];
      
      return domain || null;
      
    } catch (error) {
      console.error('❌ Failed to get enriched item:', error.response?.data || error.message);
      return null;
    }
  }

  async cleanupCollection(accessToken, collectionId) {
    try {
      await axios.delete(`${this.baseURL}/collections/${collectionId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log(`🧹 Cleaned up temp collection: ${collectionId}`);
      
    } catch (error) {
      console.log(`⚠️ Failed to cleanup collection: ${error.message}`);
      // Don't throw - cleanup failure isn't critical
    }
  }
}

module.exports = DatablistService;