// services/brightdata.js - ULTIMATE COST-OPTIMIZED VERSION
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
      
      const domain = await this.findDomainWithSmartOpenAI(searchResults, companyName);
      
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

  async findDomainWithSmartOpenAI(html, companyName) {
    console.log(`🤖 SMART OPENAI ANALYSIS for: ${companyName}`);
    
    try {
      // STEP 1: Extract ALL domains comprehensively
      const allDomains = this.extractEveryPossibleDomain(html);
      
      if (allDomains.length === 0) {
        console.log(`❌ No domains extracted from search results`);
        return null;
      }
      
      console.log(`🔍 Extracted ${allDomains.length} total domains`);
      
      // STEP 2: SMART PRE-FILTERING to reduce AI costs
      const relevantDomains = this.smartPreFilter(allDomains, companyName);
      
      console.log(`🔍 Smart pre-filter: ${relevantDomains.length} relevant domains (from ${allDomains.length})`);
      relevantDomains.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.domain} - "${d.context.substring(0, 60)}..."`);
      });
      
      if (relevantDomains.length === 0) {
        console.log(`❌ No relevant domains after smart filtering`);
        return null;
      }
      
      // STEP 3: If only one relevant domain, return it (no AI needed)
      if (relevantDomains.length === 1) {
        console.log(`✅ Only one relevant domain found: ${relevantDomains[0].domain}`);
        return relevantDomains[0].domain;
      }
      
      // STEP 4: Use OpenAI only for final selection among pre-filtered candidates
      const selectedDomain = await this.useOpenAIForFinalSelection(relevantDomains, companyName);
      
      return selectedDomain;
      
    } catch (error) {
      console.error('Smart OpenAI analysis error:', error.message);
      return null;
    }
  }

  smartPreFilter(allDomains, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    const companyLower = companyName.toLowerCase();
    
    console.log(`🧠 Smart pre-filtering with company words: [${companyWords.join(', ')}]`);
    
    // STEP 1: Remove obvious platform domains
    const nonPlatformDomains = allDomains.filter(item => {
      const domain = item.domain.toLowerCase();
      
      const platformDomains = [
        'google.com', 'youtube.com', 'linkedin.com', 'facebook.com', 
        'twitter.com', 'instagram.com', 'crunchbase.com', 'amazon.com',
        'ebay.com', 'wikipedia.org', 'w3.org', 'github.com',
        'stackoverflow.com', 'reddit.com', 'medium.com'
      ];
      
      const isPlatform = platformDomains.includes(domain);
      
      if (isPlatform) {
        console.log(`❌ Filtered out platform: ${domain}`);
        return false;
      }
      
      return true;
    });
    
    // STEP 2: Find domains with strong company connections
    const strongMatches = nonPlatformDomains.filter(item => {
      const domain = item.domain.toLowerCase();
      const context = item.context.toLowerCase();
      
      // Strong match criteria
      const domainHasMainWord = companyWords[0] && companyWords[0].length >= 3 && domain.includes(companyWords[0]);
      const domainHasAnyWord = companyWords.some(word => word.length >= 3 && domain.includes(word));
      const contextHasCompanyName = context.includes(companyLower);
      const contextHasMultipleWords = companyWords.filter(word => word.length >= 3 && context.includes(word)).length >= 2;
      const isEarlyResult = item.position <= 5;
      
      const isStrong = domainHasMainWord || 
                      (domainHasAnyWord && isEarlyResult) ||
                      (contextHasCompanyName && isEarlyResult) ||
                      contextHasMultipleWords;
      
      if (isStrong) {
        console.log(`✅ Strong match: ${domain} (${domainHasMainWord ? 'main-word' : ''} ${domainHasAnyWord ? 'any-word' : ''} ${contextHasCompanyName ? 'context-name' : ''} ${isEarlyResult ? 'early' : ''})`);
      }
      
      return isStrong;
    });
    
    // STEP 3: If we have strong matches, use them. Otherwise, use top 10 by position
    if (strongMatches.length > 0) {
      console.log(`🎯 Using ${strongMatches.length} strong matches`);
      return strongMatches.slice(0, 8); // Limit to top 8 for AI
    } else {
      console.log(`🔧 No strong matches, using top 10 by position`);
      return nonPlatformDomains
        .sort((a, b) => a.position - b.position)
        .slice(0, 10);
    }
  }

  async useOpenAIForFinalSelection(domains, companyName) {
    console.log(`🤖 Using OpenAI 3.5 for final selection among ${domains.length} candidates`);
    
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Compact domain list for cost efficiency
      const domainList = domains.map((item, index) => {
        return `${index + 1}. ${item.domain} - ${item.context.substring(0, 80)}...`;
      }).join('\n');
      
      const prompt = `Company: "${companyName}"
Domains found in Google search:
${domainList}

Which domain is the actual official website for "${companyName}"?

Rules:
- Company name may be abbreviated (e.g., "IWS" for "International Widget Solutions")
- Any TLD is valid (.com, .net, .org, .ai, .gov, etc.)
- Look for the domain that clearly belongs to this specific company
- Ignore platform domains

Respond with just the domain name or "NONE".`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // FIXED: Using cost-optimized model
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
          console.log(`🎯 OpenAI 3.5 selected: ${selectedDomain}`);
          return selectedDomain;
        }
      }
      
    } catch (aiError) {
      console.error('❌ OpenAI selection failed:', aiError.message);
    }
    
    // Fallback: Return highest positioned domain
    if (domains.length > 0) {
      const fallbackDomain = domains.sort((a, b) => a.position - b.position)[0];
      console.log(`🔧 Fallback: Using earliest domain: ${fallbackDomain.domain}`);
      return fallbackDomain.domain;
    }
    
    return null;
  }

  extractEveryPossibleDomain(html) {
    const domains = [];
    const foundDomains = new Set();
    
    try {
      console.log(`🔍 MAXIMUM COVERAGE domain extraction...`);
      
      // Strategy 1: All href links in order of appearance
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
      
      // Strategy 2: Domain mentions in text
      const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const textDomainPatterns = [
        /(?:^|\s)([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\s|$|\/|:)/g,
        /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
        /"([a-zA-Z0-9-]+\.[a-zA-Z]{2,})"/g,
        /\(([a-zA-Z0-9-]+\.[a-zA-Z]{2,})\)/g
      ];
      
      textDomainPatterns.forEach(pattern => {
        let textMatch;
        while ((textMatch = pattern.exec(visibleText)) !== null) {
          const domain = textMatch[1].toLowerCase().trim();
          
          if (this.isValidDomain(domain) && !foundDomains.has(domain)) {
            foundDomains.add(domain);
            
            const textContext = this.extractTextContextForDomain(visibleText, domain);
            
            domains.push({
              domain: domain,
              context: textContext,
              linkText: '',
              url: '',
              position: position++,
              source: 'text'
            });
          }
        }
      });
      
      // Strategy 3: Meta tags
      const metaDomains = this.extractFromMetaAndStructured(html);
      metaDomains.forEach(domainInfo => {
        if (!foundDomains.has(domainInfo.domain)) {
          foundDomains.add(domainInfo.domain);
          domains.push({
            ...domainInfo,
            position: position++,
            source: 'meta'
          });
        }
      });
      
      console.log(`🔍 TOTAL EXTRACTED: ${domains.length} unique domains`);
      return domains;
      
    } catch (error) {
      console.error('Maximum coverage extraction error:', error.message);
      return [];
    }
  }

  extractRichContextForDomain(html, domain, linkText, url) {
    try {
      const urlIndex = html.indexOf(url);
      if (urlIndex === -1) return linkText;
      
      const contextStart = Math.max(0, urlIndex - 400);
      const contextEnd = Math.min(html.length, urlIndex + url.length + 400);
      const rawContext = html.substring(contextStart, contextEnd);
      
      const cleanContext = rawContext
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      return `${linkText} ${cleanContext}`.substring(0, 300);
      
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

  extractFromMetaAndStructured(html) {
    const domains = [];
    
    try {
      const metaPatterns = [
        /<meta[^>]+property="og:url"[^>]+content="(https?:\/\/[^"]+)"/gi,
        /<meta[^>]+name="twitter:domain"[^>]+content="([^"]+)"/gi,
        /<link[^>]+rel="canonical"[^>]+href="(https?:\/\/[^"]+)"/gi
      ];
      
      metaPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          try {
            const url = match[1];
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
            
            if (this.isValidDomain(domain)) {
              domains.push({
                domain: domain,
                context: 'Found in meta tags',
                linkText: '',
                url: url
              });
            }
          } catch (error) {
            // Skip invalid URLs
          }
        }
      });
      
    } catch (error) {
      console.error('Meta extraction error:', error.message);
    }
    
    return domains;
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

  // CEO finding methods (enhanced from your Python script)
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
      // Primary queries with company name (from your Python version)
      queries.push(`CEO of ${company} ${domain}`);
      queries.push(`CEO of ${company}`);
      queries.push(`${company} leadership`);
      queries.push(`${company} chief executive officer`);
      queries.push(`${company} president founder`);
      queries.push(`"${company}" CEO site:${domain}`);
    } else {
      // Fallback queries when no company name
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