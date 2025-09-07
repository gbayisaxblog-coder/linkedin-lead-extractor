// services/brightdata.js - COMPLETE WITH STRICT FILTERING
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
      const searchResults = await this.searchCompanyWebsite(companyName);
      
      if (!searchResults) {
        console.log(`❌ No search results for: ${companyName}`);
        return null;
      }
      
      const domain = await this.findDomainWithStrictFiltering(searchResults, companyName);
      
      if (domain) {
        console.log(`✅ Domain found: ${companyName} → ${domain}`);
        return domain;
      }
      
      console.log(`❌ No domain found for: ${companyName}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Domain finding failed for ${companyName}:`, error.message);
      return null;
    }
  }

  async searchCompanyWebsite(companyName) {
    try {
      const searchQuery = `"${companyName}" website`;
      console.log(`🔍 Searching Google: ${searchQuery}`);
      
      const requestData = {
        url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=20`,
        zone: "domain_finder",
        country: "US",
        format: "raw"
      };
      
      const response = await axios.post(this.baseURL, requestData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000
      });

      if (response.status === 200 && response.data) {
        console.log(`✅ Google search successful for ${companyName} (${response.data.length} chars)`);
        return response.data;
      } else {
        console.log(`❌ Google search failed for ${companyName}: Status ${response.status}`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Google search error for ${companyName}:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      return null;
    }
  }

  async findDomainWithStrictFiltering(html, companyName) {
    console.log(`🛡️ STRICT FILTERING for: ${companyName}`);
    
    try {
      // STEP 1: Extract ALL domains
      const allDomains = this.extractEveryPossibleDomain(html);
      
      if (allDomains.length === 0) {
        console.log(`❌ No domains extracted`);
        return null;
      }
      
      console.log(`🔍 Extracted ${allDomains.length} total domains`);
      
      // STEP 2: STRICT filtering - remove ALL platform domains
      const validDomains = allDomains.filter(item => {
        const domain = item.domain.toLowerCase();
        
        // COMPREHENSIVE platform exclusion list
        const platformDomains = [
          // Social media
          'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'snapchat.com',
          'linkedin.com', 'youtube.com', 'pinterest.com', 'tumblr.com', 'x.com', 'pic.x.com',
          
          // E-commerce
          'amazon.com', 'ebay.com', 'etsy.com', 'shopify.com',
          
          // Business directories
          'crunchbase.com', 'bloomberg.com', 'reuters.com', 'forbes.com',
          'glassdoor.com', 'indeed.com', 'angel.co', 'pitchbook.com',
          
          // Tech platforms
          'github.com', 'stackoverflow.com', 'reddit.com', 'medium.com',
          'dev.to', 'hashnode.com', 'producthunt.com',
          
          // Google services
          'google.com', 'youtube.com', 'maps.google.com', 'translate.google.com',
          'support.google.com', 'accounts.google.com', 'policies.google.com',
          'developers.google.com', 'googleblog.com',
          
          // Other platforms
          'w3.org', 'wikipedia.org', 'mozilla.org', 'apache.org',
          'bit.ly', 'tinyurl.com', 'ow.ly', 't.co',
          'spotify.com', 'soundcloud.com', 'vimeo.com',
          'slack.com', 'discord.com', 'telegram.org',
          
          // Content/sharing platforms
          'open.spotify.com', 'threads.net', 'doi.org', 'digital.gov'
        ];
        
        const isPlatform = platformDomains.some(platform => {
          return domain === platform || domain.endsWith('.' + platform);
        });
        
        if (isPlatform) {
          console.log(`❌ STRICT FILTER: Excluded platform domain: ${domain}`);
          return false;
        }
        
        return true;
      });
      
      console.log(`🔍 After strict filtering: ${validDomains.length} valid domains remain`);
      validDomains.slice(0, 10).forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.domain} - "${d.context.substring(0, 60)}..."`);
      });
      
      if (validDomains.length === 0) {
        console.log(`❌ No valid domains after strict filtering`);
        return null;
      }
      
      // STEP 3: Smart company-specific filtering
      const relevantDomains = this.smartCompanyFilter(validDomains, companyName);
      
      if (relevantDomains.length === 0) {
        console.log(`❌ No relevant domains after company filtering`);
        return null;
      }
      
      if (relevantDomains.length === 1) {
        console.log(`✅ Only one relevant domain: ${relevantDomains[0].domain}`);
        return relevantDomains[0].domain;
      }
      
      // STEP 4: Use OpenAI for final intelligent selection
      const selectedDomain = await this.useOpenAIForFinalSelection(relevantDomains, companyName);
      
      return selectedDomain;
      
    } catch (error) {
      console.error('Strict filtering error:', error.message);
      return null;
    }
  }

  smartCompanyFilter(validDomains, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    const companyLower = companyName.toLowerCase();
    
    console.log(`🧠 Company filtering with words: [${companyWords.join(', ')}]`);
    
    const relevantDomains = validDomains.filter(item => {
      const domain = item.domain.toLowerCase();
      const context = item.context.toLowerCase();
      
      // Check 1: Company word in domain
      const domainHasCompanyWord = companyWords.some(word => {
        if (word.length >= 2) {
          return domain.includes(word);
        }
        return false;
      });
      
      // Check 2: Company name in context
      const contextHasCompanyName = context.includes(companyLower);
      
      // Check 3: Multiple company words in context
      const contextWordMatches = companyWords.filter(word => 
        word.length >= 2 && context.includes(word)
      ).length;
      
      // Check 4: Abbreviation
      const abbreviation = companyWords.filter(w => w.length > 2).map(w => w[0]).join('');
      const hasAbbreviation = abbreviation.length >= 2 && domain.includes(abbreviation);
      
      // Check 5: Early position with any company connection
      const isEarly = item.position <= 8;
      const hasAnyConnection = domainHasCompanyWord || contextHasCompanyName || contextWordMatches >= 1;
      
      const isRelevant = domainHasCompanyWord || 
                        contextHasCompanyName || 
                        contextWordMatches >= 2 ||
                        hasAbbreviation ||
                        (isEarly && hasAnyConnection);
      
      if (isRelevant) {
        console.log(`✅ Relevant: ${domain} (${domainHasCompanyWord ? 'domain-word' : ''} ${contextHasCompanyName ? 'context-name' : ''} ${contextWordMatches >= 2 ? 'multi-words' : ''})`);
      }
      
      return isRelevant;
    });
    
    console.log(`🔍 Company filter: ${relevantDomains.length} relevant domains`);
    return relevantDomains.slice(0, 8);
  }

  async useOpenAIForFinalSelection(domains, companyName) {
    console.log(`🤖 OpenAI 3.5 final selection for: ${companyName}`);
    
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const domainList = domains.map((item, index) => {
        return `${index + 1}. ${item.domain} - ${item.context.substring(0, 100)}...`;
      }).join('\n');
      
      const prompt = `Company: "${companyName}"
Domains found in Google search (platforms already filtered out):
${domainList}

Which domain is the actual official website for "${companyName}"?

RULES:
- Company name may be abbreviated (e.g., "IWS" for "International Widget Solutions")
- Any TLD is valid (.com, .net, .org, .ai, .gov, etc.)
- Look for the domain that clearly belongs to this specific company
- If NONE of these domains belong to "${companyName}", respond with "NONE"

Respond with just the domain name or "NONE".`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      });

      const selectedDomain = response.choices[0].message.content?.trim().toLowerCase();
      
      if (selectedDomain && selectedDomain !== 'none') {
        const matchingDomain = domains.find(item => 
          item.domain.toLowerCase() === selectedDomain
        );
        
        if (matchingDomain) {
          console.log(`🎯 OpenAI selected: ${selectedDomain}`);
          return selectedDomain;
        }
      }
      
    } catch (aiError) {
      console.error('❌ OpenAI selection failed:', aiError.message);
    }
    
    // Fallback: Return domain with best company match
    const fallbackDomain = this.selectFallbackDomain(domains, companyName);
    return fallbackDomain;
  }

  selectFallbackDomain(domains, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    
    let bestDomain = null;
    let bestScore = 0;
    
    domains.forEach(item => {
      let score = 0;
      const domain = item.domain.toLowerCase();
      
      // Score for company words in domain
      companyWords.forEach(word => {
        if (word.length >= 2 && domain.includes(word)) {
          score += word.length * 10;
        }
      });
      
      // Bonus for early position
      score += Math.max(0, 20 - item.position * 2);
      
      if (score > bestScore) {
        bestScore = score;
        bestDomain = item.domain;
      }
    });
    
    if (bestDomain && bestScore > 5) {
      console.log(`🔧 Fallback selection: ${bestDomain} (${bestScore} points)`);
      return bestDomain;
    }
    
    return null;
  }

  extractEveryPossibleDomain(html) {
    const domains = [];
    const foundDomains = new Set();
    
    try {
      // Extract from href links
      const hrefPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
      let hrefMatch;
      let position = 1;
      
      while ((hrefMatch = hrefPattern.exec(html)) !== null) {
        try {
          const url = hrefMatch[1];
          const linkText = this.cleanText(hrefMatch[2]);
          
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
          
          if (this.isValidDomain(domain) && !foundDomains.has(domain)) {
            foundDomains.add(domain);
            
            const richContext = this.extractRichContextForDomain(html, domain, linkText, url);
            
            domains.push({
              domain: domain,
              context: richContext,
              linkText: linkText,
              url: url,
              position: position++,
              source: 'href'
            });
          }
        } catch (urlError) {
          // Skip invalid URLs
        }
      }
      
      // Extract from text mentions
      const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const textDomainPatterns = [
        /(?:^|\s)([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\s|$|\/|:)/g,
        /"([a-zA-Z0-9-]+\.[a-zA-Z]{2,})"/g,
        /\(([a-zA-Z0-9-]+\.[a-zA-Z]{2,})\)/g
      ];
      
      textDomainPatterns.forEach(pattern => {
        let textMatch;
        while ((textMatch = pattern.exec(visibleText)) !== null) {
          const domain = textMatch[1].toLowerCase().trim();
          
          if (this.isValidDomain(domain) && !foundDomains.has(domain)) {
            foundDomains.add(domain);
            
            domains.push({
              domain: domain,
              context: this.extractTextContextForDomain(visibleText, domain),
              linkText: '',
              url: '',
              position: position++,
              source: 'text'
            });
          }
        }
      });
      
      console.log(`🔍 TOTAL EXTRACTED: ${domains.length} unique domains`);
      return domains;
      
    } catch (error) {
      console.error('Domain extraction error:', error.message);
      return [];
    }
  }

  extractRichContextForDomain(html, domain, linkText, url) {
    try {
      const urlIndex = html.indexOf(url);
      if (urlIndex === -1) return linkText;
      
      const contextStart = Math.max(0, urlIndex - 300);
      const contextEnd = Math.min(html.length, urlIndex + url.length + 300);
      const rawContext = html.substring(contextStart, contextEnd);
      
      const cleanContext = rawContext
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return `${linkText} ${cleanContext}`.substring(0, 400);
      
    } catch (error) {
      return linkText;
    }
  }

  extractTextContextForDomain(text, domain) {
    try {
      const domainIndex = text.toLowerCase().indexOf(domain);
      if (domainIndex === -1) return '';
      
      const start = Math.max(0, domainIndex - 100);
      const end = Math.min(text.length, domainIndex + domain.length + 100);
      
      return text.substring(start, end).trim();
      
    } catch (error) {
      return '';
    }
  }

  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    
    return domain.includes('.') && 
           domain.length > 2 &&
           domain.length < 100 &&
           /^[a-zA-Z0-9.-]+$/.test(domain) &&
           !domain.startsWith('.') &&
           !domain.endsWith('.') &&
           !domain.includes('..') &&
           /\.[a-zA-Z]{2,}$/.test(domain) &&
           /[a-zA-Z]/.test(domain);
  }

  cleanText(text) {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeCompanyName(companyName) {
    return companyName
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|lp|llp|group|international|global|solutions|services|systems|technologies|tech|office|executive|investment)\b\.?/gi, '')
      .replace(/[&]/g, 'and')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(word => word.length > 1);
  }

  // CEO finding methods
  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO: ${companyName} (${domain})`);
    
    try {
      const searchQueries = this.buildCEOSearchQueries(companyName, domain);
      console.log(`🔍 Will try ${searchQueries.length} CEO search strategies`);
      
      let bestSearchText = '';
      let searchAttempts = 0;
      
      for (const query of searchQueries) {
        try {
          console.log(`🔍 CEO search ${++searchAttempts}/${searchQueries.length}: ${query}`);
          
          const searchText = await this.performCEOSearch(query);
          
          if (searchText && searchText.length > bestSearchText.length) {
            bestSearchText = searchText;
            console.log(`✅ Better CEO search text found (${searchText.length} chars)`);
          }
          
          if (bestSearchText.length >= 400) {
            console.log(`✅ Sufficient CEO search text found, stopping early`);
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
          
        } catch (searchError) {
          console.error(`❌ CEO search attempt ${searchAttempts} failed:`, searchError.message);
          continue;
        }
      }
      
      if (bestSearchText && bestSearchText.length > 100) {
        console.log(`✅ CEO search results found for ${companyName} (${bestSearchText.length} chars)`);
        return bestSearchText;
      } else {
        console.log(`❌ Insufficient CEO search results for: ${companyName} (${bestSearchText.length} chars)`);
        return '';
      }
      
    } catch (error) {
      console.error(`❌ CEO search failed for ${companyName}:`, error.message);
      return '';
    }
  }

  buildCEOSearchQueries(company, domain) {
    const queries = [];
    
    if (company && company.trim()) {
      queries.push(`CEO of ${company} ${domain}`);
      queries.push(`CEO of ${company}`);
      queries.push(`${company} leadership`);
      queries.push(`${company} chief executive officer`);
      queries.push(`${company} president founder`);
      queries.push(`"${company}" CEO site:${domain}`);
    } else {
      queries.push(`CEO of ${domain}`);
      queries.push(`site:${domain} CEO`);
      queries.push(`${domain} chief executive`);
    }
    
    queries.push(`"${domain}" CEO president`);
    queries.push(`"${domain}" leadership team`);
    
    return queries;
  }

  async performCEOSearch(query) {
    try {
      const requestData = {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`,
        zone: "domain_finder",
        country: "US",
        format: "raw"
      };
      
      const response = await axios.post(this.baseURL, requestData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000
      });

      if (response.data && response.status === 200) {
        const relevantText = this.extractCEORelevantText(response.data, query);
        return relevantText;
      }
      
      return '';
      
    } catch (error) {
      console.error(`❌ CEO search request failed for query "${query}":`, error.message);
      return '';
    }
  }

  extractCEORelevantText(html, originalQuery) {
    try {
      let visibleText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const ceoKeywords = [
        'ceo', 'chief executive', 'chief executive officer', 'president', 
        'founder', 'executive director', 'managing director', 'chairman',
        'co-founder', 'managing partner', 'executive chairman'
      ];
      
      const companyFromQuery = this.extractCompanyFromQuery(originalQuery);
      
      const sentences = visibleText.split(/[.!?]/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        
        const hasCEOTerm = ceoKeywords.some(keyword => lowerSentence.includes(keyword));
        
        let hasCompanyReference = true;
        if (companyFromQuery) {
          const companyWords = this.normalizeCompanyName(companyFromQuery);
          hasCompanyReference = companyWords.some(word => 
            word.length > 2 && lowerSentence.includes(word.toLowerCase())
          ) || lowerSentence.includes(companyFromQuery.toLowerCase());
        }
        
        const isSubstantial = sentence.length > 15 && sentence.length < 500;
        
        return hasCEOTerm && hasCompanyReference && isSubstantial;
      });
      
      if (sentences.length > 0) {
        const relevantText = sentences.slice(0, 12).join('. ');
        console.log(`📄 Extracted ${sentences.length} relevant CEO sentences`);
        return relevantText;
      }
      
      const ceoOnlyText = visibleText.split(/[.!?]/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return ceoKeywords.some(keyword => lowerSentence.includes(keyword)) && 
               sentence.length > 15 && 
               sentence.length < 500;
      }).slice(0, 20).join('. ');
      
      return ceoOnlyText || visibleText.substring(0, 2000);
      
    } catch (error) {
      console.error('CEO text extraction error:', error.message);
      return '';
    }
  }

  extractCompanyFromQuery(query) {
    const patterns = [
      /CEO of ([^{]+?) [\w.-]+\.\w+/i,
      /CEO of ([^{]+?)$/i,
      /"([^"]+)" CEO/i
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }
}

module.exports = BrightDataService;