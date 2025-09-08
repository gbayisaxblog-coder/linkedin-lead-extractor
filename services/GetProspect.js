const axios = require('axios');

class GetProspectService {
  constructor() {
    this.apiKey = process.env.GETPROSPECT_API_KEY;
    this.baseUrl = 'https://api.getprospect.com/public/v1';
    
    if (!this.apiKey) {
      console.error('❌ GetProspect API key not configured');
    }
  }

  // Email patterns ordered by frequency
  getEmailPatterns() {
    return [
      { name: 'flast', format: '{f}{last}', frequency: 42.9 },
      { name: 'first.last', format: '{first}.{last}', frequency: 30.8 },
      { name: 'first_only', format: '{first}', frequency: 13.9 },
      { name: 'firstl', format: '{first}{l}', frequency: 2.0 },
      { name: 'firstlast', format: '{first}{last}', frequency: 2.0 },
      { name: 'f.last', format: '{f}.{last}', frequency: 1.1 },
      { name: 'last_only', format: '{last}', frequency: 1.0 },
      { name: 'lastf', format: '{last}{f}', frequency: 0.8 },
      { name: 'first_last', format: '{first}_{last}', frequency: 0.5 },
      { name: 'first.l', format: '{first}.{l}', frequency: 0.4 },
      { name: 'last.first', format: '{last}.{first}', frequency: 0.2 },
      { name: 'last.f', format: '{last}.{f}', frequency: 0.1 },
      { name: 'last_first', format: '{last}_{first}', frequency: 0.05 },
      { name: 'lastfirst', format: '{last}{first}', frequency: 0.05 },
      { name: 'first-last', format: '{first}-{last}', frequency: 0.1 },
      { name: 'f-last', format: '{f}-{last}', frequency: 0.1 },
      { name: 'first-l', format: '{first}-{l}', frequency: 0.1 },
      { name: 'fl', format: '{f}{l}', frequency: 0.1 },
      { name: 'f.l', format: '{f}.{l}', frequency: 0.1 },
      { name: 'last-first', format: '{last}-{first}', frequency: 0.05 }
    ];
  }

  // Generate email from pattern
  generateEmail(pattern, firstName, lastName, domain) {
    const f = firstName.charAt(0).toLowerCase();
    const l = lastName.charAt(0).toLowerCase();
    const first = firstName.toLowerCase();
    const last = lastName.toLowerCase();

    let email = pattern.format
      .replace('{f}', f)
      .replace('{l}', l)
      .replace('{first}', first)
      .replace('{last}', last);

    return `${email}@${domain}`;
  }

  // Verify email using GetProspect API
  async verifyEmail(email) {
    try {
      console.log(`🔍 Verifying email: ${email}`);
      
      const response = await axios.get(`${this.baseUrl}/email/verify`, {
        params: {
          email: email,
          apiKey: this.apiKey
        },
        timeout: 10000
      });

      console.log(`📧 Verification result for ${email}:`, response.data);

      // Check if email is valid and deliverable
      if (response.data && response.data.status) {
        const status = response.data.status.toLowerCase();
        const isValid = status === 'valid' || status === 'deliverable' || response.data.deliverable === true;
        
        return {
          valid: isValid,
          status: response.data.status,
          confidence: response.data.confidence || null,
          reason: response.data.reason || null
        };
      }

      return { valid: false, status: 'unknown', reason: 'Invalid response format' };
      
    } catch (error) {
      console.error(`❌ Email verification failed for ${email}:`, error.message);
      
      // If it's a rate limit or server error, we might want to retry later
      if (error.response?.status === 429 || error.response?.status >= 500) {
        throw new Error(`API_ERROR: ${error.response?.status || 'Network error'}`);
      }
      
      return { valid: false, status: 'error', reason: error.message };
    }
  }

  // Find verified email for a person and domain
  async findVerifiedEmail(firstName, lastName, domain) {
    console.log(`🔍 Finding email for ${firstName} ${lastName} at ${domain}`);
    
    if (!firstName || !lastName || !domain) {
      throw new Error('Missing required parameters: firstName, lastName, domain');
    }

    const patterns = this.getEmailPatterns();
    
    for (const pattern of patterns) {
      try {
        const email = this.generateEmail(pattern, firstName, lastName, domain);
        console.log(`📧 Testing pattern ${pattern.name}: ${email}`);
        
        const verification = await this.verifyEmail(email);
        
        if (verification.valid) {
          console.log(`✅ Found verified email: ${email} (pattern: ${pattern.name})`);
          return {
            email: email,
            pattern: pattern.name,
            confidence: verification.confidence,
            status: verification.status
          };
        }
        
        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        if (error.message.includes('API_ERROR')) {
          console.log(`⚠️ API error, stopping email search: ${error.message}`);
          throw error;
        }
        
        console.log(`⚠️ Pattern ${pattern.name} failed: ${error.message}`);
        continue;
      }
    }
    
    console.log(`❌ No verified email found for ${firstName} ${lastName} at ${domain}`);
    return null;
  }
}

module.exports = new GetProspectService();