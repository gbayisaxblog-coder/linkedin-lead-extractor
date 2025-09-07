// services/brightdata.js - ULTIMATE OPENAI-POWERED DOMAIN FINDING
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
      
      // ULTIMATE STRATEGY: Extract EVERYTHING, let OpenAI decide
      const domain = await this.findDomainWithOpenAIIntelligence(searchResults, companyName);
      
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

  async findDomainWithOpenAIIntelligence(html, companyName) {
    console.log(`🤖 OPENAI INTELLIGENCE for: ${companyName}`);
    
    try {
      // STEP 1: Extract ALL possible domains with maximum coverage
      const allDomains = this.extractEveryPossibleDomain(html);
      
      if (allDomains.length === 0) {
        console.log(`❌ No domains extracted from search results`);
        return null;
      }
      
      console.log(`🔍 Extracted ${allDomains.length} total domains:`);
      allDomains.slice(0, 15).forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.domain} - "${d.context.substring(0, 80)}..."`);
      });
      
      // STEP 2: Filter out only the most obvious platform domains (minimal filtering)
      const filteredDomains = allDomains.filter(item => {
        const domain = item.domain.toLowerCase();
        
        // Only exclude the most obvious Google domains
        const obviousGoogleDomains = [
          'google.com', 'youtube.com', 'maps.google.com', 'translate.google.com',
          'support.google.com', 'accounts.google.com'
        ];
        
        const isObviousGoogle = obviousGoogleDomains.some(gDomain => domain === gDomain);
        
        if (isObviousGoogle) {
          console.log(`❌ Excluded obvious Google domain: ${domain}`);
          return false;
        }
        
        return true;
      });
      
      console.log(`🔍 After minimal filtering: ${filteredDomains.length} domains for OpenAI analysis`);
      
      if (filteredDomains.length === 0) {
        console.log(`❌ No domains left after filtering`);
        return null;
      }
      
      // STEP 3: Let OpenAI make the intelligent decision
      const selectedDomain = await this.useOpenAIForIntelligentDomainSelection(filteredDomains, companyName);
      
      return selectedDomain;
      
    } catch (error) {
      console.error('OpenAI intelligence error:', error.message);
      return null;
    }
  }

  extractEveryPossibleDomain(html) {
    const domains = [];
    const foundDomains = new Set();
    
    try {
      console.log(`🔍 MAXIMUM COVERAGE domain extraction...`);
      
      // Strategy 1: All href links (most reliable source)
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
            
            // Get rich context around this domain
            const richContext = this.extractRichContextForDomain(html, domain, linkText, url);
            
            domains.push({
              domain: domain,
              context: richContext,
              linkText: linkText,
              url: url,
              position: position++,
              source: 'href'
            });
            
            console.log(`  ${domains.length}. ${domain} - "${linkText.substring(0, 50)}..."`);
          }
        } catch (urlError) {
          // Skip invalid URLs
        }
      }
      
      // Strategy 2: Domain mentions in visible text
      const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const textDomainPatterns = [
        // Standard domain pattern
        /(?:^|\s)([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\s|$|\/|:)/g,
        // Domain with protocol mentions
        /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
        // Quoted domains
        /"([a-zA-Z0-9-]+\.[a-zA-Z]{2,})"/g,
        // Parentheses domains
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
            
            console.log(`  ${domains.length}. ${domain} (from text)`);
          }
        }
      });
      
      // Strategy 3: Extract from meta tags and structured data
      const metaDomains = this.extractFromMetaAndStructured(html);
      metaDomains.forEach(domainInfo => {
        if (!foundDomains.has(domainInfo.domain)) {
          foundDomains.add(domainInfo.domain);
          domains.push({
            ...domainInfo,
            position: position++,
            source: 'meta'
          });
          
          console.log(`  ${domains.length}. ${domainInfo.domain} (from meta)`);
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
      // Find the position of this URL in the HTML
      const urlIndex = html.indexOf(url);
      if (urlIndex === -1) return linkText;
      
      // Extract a large context window around the URL
      const contextStart = Math.max(0, urlIndex - 800);
      const contextEnd = Math.min(html.length, urlIndex + url.length + 800);
      const rawContext = html.substring(contextStart, contextEnd);
      
      // Clean the context and make it readable
      const cleanContext = rawContext
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Combine link text with surrounding context
      const fullContext = `${linkText} ${cleanContext}`.substring(0, 500);
      
      return fullContext;
      
    } catch (error) {
      return linkText;
    }
  }

  extractTextContextForDomain(text, domain) {
    try {
      // Find context around domain mentions in text
      const domainIndex = text.toLowerCase().indexOf(domain);
      if (domainIndex === -1) return '';
      
      const start = Math.max(0, domainIndex - 150);
      const end = Math.min(text.length, domainIndex + domain.length + 150);
      
      return text.substring(start, end).trim();
      
    } catch (error) {
      return '';
    }
  }

  extractFromMetaAndStructured(html) {
    const domains = [];
    
    try {
      // Extract from meta tags
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

  async useOpenAIForIntelligentDomainSelection(domains, companyName) {
    console.log(`🤖 Using OpenAI to intelligently select domain for: ${companyName}`);
    
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Prepare comprehensive domain analysis for OpenAI
      const domainAnalysis = domains.slice(0, 15).map((item, index) => {
        return `${index + 1}. Domain: ${item.domain}
   Context: ${item.context}
   Link Text: ${item.linkText}
   Source: ${item.source}
   Position: ${item.position}`;
      }).join('\n\n');
      
      const prompt = `You are analyzing Google search results to find the actual official website domain for the company "${companyName}".

Company Name: "${companyName}"

Here are ALL the domains found in the search results with their context:

${domainAnalysis}

Your task is to identify which domain is the ACTUAL official website for "${companyName}".

IMPORTANT GUIDELINES:
1. The company name might appear abbreviated, shortened, or in different forms in the domain (e.g., "IWS" for "International Widget Solutions")
2. Look for domains that clearly belong to this specific company based on context
3. Consider context clues like "official website", company descriptions, etc.
4. ANY TLD is valid (.com, .net, .org, .co.uk, .gov, .ai, etc.)
5. Short domain names can be valid (e.g., "iws.com" for "International Widget Solutions")
6. Ignore platform domains like LinkedIn, Facebook, Crunchbase, Wikipedia, Amazon, eBay
7. The official domain might not be the first result - read all contexts carefully
8. Look for domains mentioned in company descriptions or official contexts
9. If multiple domains seem valid, pick the most official-looking one
10. If NONE of these domains actually belong to "${companyName}", respond with "NONE"

Respond with ONLY the domain name (e.g., "microsoft.com" or "iws.com") or "NONE" if no actual company domain is found.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4", // Using GPT-4 for maximum intelligence
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 100
      });

      const selectedDomain = response.choices[0].message.content?.trim().toLowerCase();
      
      if (selectedDomain && selectedDomain !== 'none') {
        // Verify the selected domain exists in our candidates
        const matchingDomain = domains.find(item => 
          item.domain.toLowerCase() === selectedDomain
        );
        
        if (matchingDomain) {
          console.log(`🎯 OpenAI selected actual company domain: ${selectedDomain}`);
          console.log(`🔍 Context: ${matchingDomain.context.substring(0, 100)}...`);
          return selectedDomain;
        } else {
          console.log(`⚠️ OpenAI selected domain not in candidates: ${selectedDomain}`);
          
          // Check if it's a close match (case sensitivity, www prefix, etc.)
          const closeMatch = domains.find(item => {
            const itemDomain = item.domain.toLowerCase();
            const selectedLower = selectedDomain.toLowerCase();
            return itemDomain === selectedLower || 
                   itemDomain === `www.${selectedLower}` ||
                   `www.${itemDomain}` === selectedLower;
          });
          
          if (closeMatch) {
            console.log(`✅ Found close match: ${closeMatch.domain}`);
            return closeMatch.domain;
          }
        }
      } else {
        console.log(`❌ OpenAI determined no actual company domain exists for: ${companyName}`);
      }
      
    } catch (aiError) {
      console.error('❌ OpenAI domain analysis failed:', aiError.message);
      
      // Fallback: Use intelligent scoring without AI
      return this.fallbackIntelligentSelection(domains, companyName);
    }
    
    return null;
  }

  fallbackIntelligentSelection(domains, companyName) {
    console.log(`🔧 Using intelligent fallback for: ${companyName}`);
    
    const companyWords = this.normalizeCompanyName(companyName);
    let bestMatch = null;
    let bestScore = 0;
    
    domains.forEach(item => {
      let score = 0;
      const domain = item.domain.toLowerCase();
      const context = item.context.toLowerCase();
      
      // Massive penalty for platform domains
      const platformDomains = ['linkedin.com', 'facebook.com', 'crunchbase.com', 'amazon.com', 'ebay.com'];
      if (platformDomains.includes(domain)) {
        score -= 1000;
        return;
      }
      
      // Score for company words in domain
      companyWords.forEach(word => {
        if (word.length >= 2 && domain.includes(word)) {
          score += word.length * 20;
        }
      });
      
      // Score for company name in context
      if (context.includes(companyName.toLowerCase())) {
        score += 100;
      }
      
      // Score for position (earlier is better)
      score += Math.max(0, 30 - item.position * 2);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    });
    
    if (bestMatch && bestScore > 10) {
      console.log(`🎯 Fallback selection: ${bestMatch.domain} (${bestScore} points)`);
      return bestMatch.domain;
    }
    
    return null;
  }

  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    
    return domain.includes('.') && 
           domain.length > 2 && // Allow very short domains like "ai.com"
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