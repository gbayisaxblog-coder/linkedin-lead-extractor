// services/brightdata.js - COMPLETE ENHANCED VERSION
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
      // Step 1: Enhanced Google search for company website
      const searchResults = await this.searchCompanyWebsite(companyName);
      
      if (!searchResults) {
        console.log(`❌ No search results for: ${companyName}`);
        return null;
      }
      
      // Step 2: Extract ALL domains from search results
      const allDomains = this.extractAllDomainsWithContext(searchResults, companyName);
      
      if (allDomains.length === 0) {
        console.log(`❌ No domains found in search results for: ${companyName}`);
        return null;
      }
      
      console.log(`🔍 Found ${allDomains.length} potential domains for ${companyName}:`, 
        allDomains.slice(0, 5).map(d => d.domain));
      
      // Step 3: Cost-optimized domain selection with pre-filtering
      const actualDomain = await this.selectActualCompanyDomain(allDomains, companyName);
      
      if (actualDomain) {
        console.log(`✅ Actual domain found: ${companyName} → ${actualDomain}`);
        return actualDomain;
      }
      
      console.log(`❌ Could not determine actual domain for: ${companyName}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Domain finding failed for ${companyName}:`, error.message);
      return null;
    }
  }

  async searchCompanyWebsite(companyName) {
    try {
      // Enhanced search query to find company website
      const searchQuery = `"${companyName}" website`;
      
      console.log(`🔍 Searching Google: ${searchQuery}`);
      
      const requestData = {
        url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=20`,
        zone: "domain_finder",
        country: "US",
        format: "raw" // FIXED: Using 'raw' instead of 'html'
      };
      
      console.log(`🔍 BrightData request for: ${companyName}`);
      
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

  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO: ${companyName} (${domain})`);
    
    try {
      // Enhanced CEO search with multiple strategies (like your Python version)
      const searchQueries = this.buildCEOSearchQueries(companyName, domain);
      
      console.log(`🔍 Will try ${searchQueries.length} search strategies for ${companyName}`);
      
      let bestSearchText = '';
      let searchAttempts = 0;
      
      // Try each query and keep the richest text (like your Python version)
      for (const query of searchQueries) {
        try {
          console.log(`🔍 CEO search ${++searchAttempts}/${searchQueries.length}: ${query}`);
          
          const searchText = await this.performCEOSearch(query);
          
          if (searchText && searchText.length > bestSearchText.length) {
            bestSearchText = searchText;
            console.log(`✅ Better search text found (${searchText.length} chars)`);
          }
          
          // If we have enough text, we can stop early
          if (bestSearchText.length >= 400) {
            console.log(`✅ Sufficient search text found, stopping early`);
            break;
          }
          
          // Small delay between searches (like your Python version)
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
          
        } catch (searchError) {
          console.error(`❌ Search attempt ${searchAttempts} failed:`, searchError.message);
          continue;
        }
      }
      
      if (bestSearchText && bestSearchText.length > 200) {
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
    // Enhanced query building (based on your Python logic)
    const queries = [];
    
    if (company && company.trim()) {
      // Primary queries with company name
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
    
    // Additional enhanced queries
    queries.push(`"${domain}" CEO president`);
    queries.push(`"${domain}" leadership team`);
    
    console.log(`🔍 Built ${queries.length} search queries for ${company || domain}`);
    return queries;
  }

  async performCEOSearch(query) {
    try {
      const requestData = {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`,
        zone: "domain_finder",
        country: "US",
        format: "raw" // FIXED: Using 'raw' format
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
      // Extract visible text (like your Python version)
      let visibleText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Enhanced CEO keyword detection (from your Python version)
      const ceoKeywords = [
        'ceo', 'chief executive', 'chief executive officer', 'president', 
        'founder', 'executive director', 'managing director', 'chairman',
        'co-founder', 'managing partner', 'executive chairman'
      ];
      
      // Extract company name from query for better filtering
      const companyFromQuery = this.extractCompanyFromQuery(originalQuery);
      
      // Find sentences that mention CEO-related terms AND the company
      const sentences = visibleText.split(/[.!?]/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        
        // Must have CEO-related term
        const hasCEOTerm = ceoKeywords.some(keyword => lowerSentence.includes(keyword));
        
        // Must have company reference (if we can extract it from query)
        let hasCompanyReference = true; // Default to true if we can't extract company
        if (companyFromQuery) {
          const companyWords = this.normalizeCompanyName(companyFromQuery);
          hasCompanyReference = companyWords.some(word => 
            word.length > 3 && lowerSentence.includes(word.toLowerCase())
          ) || lowerSentence.includes(companyFromQuery.toLowerCase());
        }
        
        // Must be substantial sentence
        const isSubstantial = sentence.length > 15 && sentence.length < 500;
        
        return hasCEOTerm && hasCompanyReference && isSubstantial;
      });
      
      if (sentences.length > 0) {
        // Take the most relevant sentences (like your Python version)
        const relevantText = sentences.slice(0, 12).join('. ');
        console.log(`📄 Extracted ${sentences.length} relevant CEO sentences`);
        return relevantText;
      }
      
      // Fallback: return text containing CEO keywords only
      const ceoOnlyText = visibleText.split(/[.!?]/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return ceoKeywords.some(keyword => lowerSentence.includes(keyword)) && 
               sentence.length > 15 && 
               sentence.length < 500;
      }).slice(0, 20).join('. ');
      
      if (ceoOnlyText) {
        console.log(`📄 Using CEO-keyword fallback text`);
        return ceoOnlyText;
      }
      
      // Final fallback: return first part of text
      const fallbackText = visibleText.substring(0, 2000);
      console.log(`📄 Using general fallback text (${fallbackText.length} chars)`);
      return fallbackText;
      
    } catch (error) {
      console.error('CEO text extraction error:', error.message);
      return '';
    }
  }

  extractCompanyFromQuery(query) {
    // Try to extract company name from search query
    const patterns = [
      /CEO of ([^{]+?) [\w.-]+\.\w+/i,  // "CEO of Company Name domain.com"
      /CEO of ([^{]+?)$/i,              // "CEO of Company Name"
      /"([^"]+)" CEO/i                  // "Company Name" CEO
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  // Domain finding methods (keeping existing logic but with fixed API format)
  extractAllDomainsWithContext(html, companyName) {
    const domainsWithContext = [];
    
    try {
      const resultBlocks = this.extractSearchResultBlocks(html);
      console.log(`🔍 Extracted ${resultBlocks.length} search result blocks`);
      
      resultBlocks.forEach((block, index) => {
        const domains = this.extractDomainsFromBlock(block);
        
        domains.forEach(domain => {
          domainsWithContext.push({
            domain: domain,
            context: {
              title: block.title || '',
              description: block.description || '',
              fullText: block.fullText || '',
              position: index + 1
            }
          });
        });
      });
      
      const uniqueDomains = this.deduplicateDomainsWithBestContext(domainsWithContext);
      console.log(`🔍 Found ${uniqueDomains.length} unique domains with context`);
      
      return uniqueDomains;
      
    } catch (error) {
      console.error('Domain extraction error:', error.message);
      return [];
    }
  }

  extractSearchResultBlocks(html) {
    const blocks = [];
    
    try {
      // Enhanced patterns to extract Google search results
      const resultPatterns = [
        /<div[^>]*class="[^"]*g[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*data-ved="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*jscontroller[^>]*>([\s\S]*?)<\/div>/gi
      ];
      
      let allMatches = [];
      resultPatterns.forEach(pattern => {
        const matches = html.match(pattern) || [];
        allMatches = allMatches.concat(matches);
      });
      
      // Also extract from href attributes and text content
      const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
      let linkMatch;
      while ((linkMatch = linkPattern.exec(html)) !== null) {
        const url = linkMatch[1];
        const linkText = linkMatch[2];
        
        if (url.includes('http') && !url.includes('google.com/search')) {
          allMatches.push(`<div>${linkText} ${url}</div>`);
        }
      }
      
      allMatches.forEach(match => {
        const block = {
          title: this.extractTitle(match),
          description: this.extractDescription(match),
          fullText: this.extractVisibleText(match)
        };
        
        if (block.title || block.description || block.fullText.length > 30) {
          blocks.push(block);
        }
      });
      
    } catch (error) {
      console.error('Block extraction error:', error.message);
    }
    
    return blocks.slice(0, 20);
  }

  extractTitle(htmlBlock) {
    const titlePatterns = [
      /<h3[^>]*>(.*?)<\/h3>/i,
      /<a[^>]*><h3[^>]*>(.*?)<\/h3><\/a>/i,
      /<div[^>]*role="heading"[^>]*>(.*?)<\/div>/i,
      /<h1[^>]*>(.*?)<\/h1>/i,
      /<h2[^>]*>(.*?)<\/h2>/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = htmlBlock.match(pattern);
      if (match) {
        return this.cleanText(match[1]);
      }
    }
    
    return '';
  }

  extractDescription(htmlBlock) {
    const descPatterns = [
      /<span[^>]*class="[^"]*st[^"]*"[^>]*>(.*?)<\/span>/i,
      /<div[^>]*class="[^"]*s[^"]*"[^>]*>(.*?)<\/div>/i,
      /<p[^>]*>(.*?)<\/p>/i,
      /<span[^>]*>(.*?)<\/span>/i
    ];
    
    for (const pattern of descPatterns) {
      const match = htmlBlock.match(pattern);
      if (match) {
        const text = this.cleanText(match[1]);
        if (text.length > 10) {
          return text;
        }
      }
    }
    
    return '';
  }

  extractVisibleText(htmlBlock) {
    return htmlBlock
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanText(text) {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractDomainsFromBlock(block) {
    const domains = new Set();
    const text = `${block.title} ${block.description} ${block.fullText}`;
    
    // Comprehensive regex patterns to catch ALL domain formats
    const domainPatterns = [
      /https?:\/\/(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
      /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?=\s|$|\/|:)/g,
      /href=["'](https?:\/\/[^"'\/]+)/g,
      /(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\/|\s|$)/g
    ];
    
    domainPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        try {
          let domain = match[2] || match[1];
          if (domain) {
            domain = domain.replace(/^www\./, '').toLowerCase().trim();
            domain = domain.split('/')[0];
            
            if (this.isValidDomain(domain)) {
              domains.add(domain);
            }
          }
        } catch (error) {
          // Skip invalid domains
        }
      }
    });
    
    return Array.from(domains);
  }

  isValidDomain(domain) {
    return domain.includes('.') && 
           domain.length > 3 && 
           domain.length < 100 &&
           /^[a-zA-Z0-9.-]+$/.test(domain) &&
           !domain.startsWith('.') &&
           !domain.endsWith('.') &&
           !domain.includes('..') &&
           /\.[a-zA-Z]{2,}$/.test(domain);
  }

  deduplicateDomainsWithBestContext(domainsWithContext) {
    const domainMap = new Map();
    
    domainsWithContext.forEach(item => {
      const domain = item.domain;
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, item);
      } else {
        const existing = domainMap.get(domain);
        const contextScore = this.scoreContext(item.context);
        const existingScore = this.scoreContext(existing.context);
        
        if (contextScore > existingScore) {
          domainMap.set(domain, item);
        }
      }
    });
    
    return Array.from(domainMap.values());
  }

  scoreContext(context) {
    let score = 0;
    
    // Earlier results get higher scores
    score += Math.max(0, 15 - context.position);
    
    // More context text gets higher scores
    score += Math.min(8, context.fullText.length / 100);
    
    // Having title and description gets bonus
    if (context.title && context.title.length > 5) score += 5;
    if (context.description && context.description.length > 10) score += 3;
    
    return score;
  }

  async selectActualCompanyDomain(domainsWithContext, companyName) {
    console.log(`🤖 Analyzing ${domainsWithContext.length} domains for: ${companyName}`);
    
    // Pre-filter to most relevant domains
    const relevantDomains = this.preFilterRelevantDomains(domainsWithContext, companyName);
    
    console.log(`🔍 Pre-filtered to ${relevantDomains.length} relevant domains`);
    
    if (relevantDomains.length === 0) {
      return null;
    }
    
    if (relevantDomains.length === 1) {
      console.log(`✅ Only one relevant domain: ${relevantDomains[0].domain}`);
      return relevantDomains[0].domain;
    }
    
    // Use AI for final selection
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const domainList = relevantDomains.map((item, i) => 
        `${i + 1}. ${item.domain} - ${item.context.title || 'No title'}`
      ).join('\n');
      
      const prompt = `Company: "${companyName}"
Domains from Google search:
${domainList}

Which domain is the actual official website for "${companyName}"?
- Company name may be abbreviated or different in domain
- Any TLD is valid (.com, .net, .org, .co.uk, etc.)
- Look for the domain that clearly belongs to this specific company

Respond with just the domain name or "NONE".`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      });

      const selectedDomain = response.choices[0].message.content?.trim().toLowerCase();
      
      if (selectedDomain && selectedDomain !== 'none') {
        const matchingDomain = relevantDomains.find(item => 
          item.domain.toLowerCase() === selectedDomain
        );
        
        if (matchingDomain) {
          console.log(`🎯 AI selected: ${selectedDomain}`);
          return selectedDomain;
        }
      }
      
    } catch (aiError) {
      console.error('❌ AI domain selection failed:', aiError.message);
    }
    
    // Fallback to scoring
    return this.fallbackDomainSelection(relevantDomains, companyName);
  }

  preFilterRelevantDomains(domainsWithContext, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    const companyLower = companyName.toLowerCase();
    
    const relevantDomains = domainsWithContext.filter(item => {
      const domain = item.domain.toLowerCase();
      const context = `${item.context.title} ${item.context.description}`.toLowerCase();
      
      // Check for company name matches
      const domainHasCompanyWord = companyWords.some(word => 
        word.length > 2 && domain.includes(word)
      );
      
      const contextHasFullName = context.includes(companyLower);
      
      const contextWordMatches = companyWords.filter(word => 
        word.length > 2 && context.includes(word)
      ).length;
      
      // Check for abbreviation
      const abbreviation = companyWords.map(w => w[0]).join('');
      const domainHasAbbreviation = abbreviation.length >= 2 && domain.includes(abbreviation);
      
      const isRelevant = domainHasCompanyWord || 
                        contextHasFullName || 
                        contextWordMatches >= 2 ||
                        domainHasAbbreviation;
      
      return isRelevant;
    });
    
    return relevantDomains
      .map(item => ({
        ...item,
        relevanceScore: this.calculateDomainRelevanceScore(item, companyWords, companyName)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  fallbackDomainSelection(domainsWithContext, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    let bestMatch = null;
    let bestScore = 0;
    
    domainsWithContext.forEach(item => {
      const score = this.calculateDomainRelevanceScore(item, companyWords, companyName);
      
      if (score > bestScore && score > 8) {
        bestScore = score;
        bestMatch = item;
      }
    });
    
    if (bestMatch) {
      console.log(`🎯 Fallback selection: ${bestMatch.domain} (score: ${bestScore})`);
      return bestMatch.domain;
    }
    
    return null;
  }

  normalizeCompanyName(companyName) {
    return companyName
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|lp|llp|group|international|global|solutions|services|systems|technologies|tech)\b\.?/gi, '')
      .replace(/[&]/g, 'and')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(word => word.length > 1);
  }

  calculateDomainRelevanceScore(domainWithContext, companyWords, originalCompanyName) {
    let score = 0;
    const { domain, context } = domainWithContext;
    const domainLower = domain.toLowerCase();
    const fullContext = `${context.title} ${context.description} ${context.fullText}`.toLowerCase();
    
    // High score for exact company name in context
    if (fullContext.includes(originalCompanyName.toLowerCase())) {
      score += 25;
    }
    
    // Score for company words in domain
    companyWords.forEach(word => {
      if (word.length > 2 && domainLower.includes(word)) {
        score += word.length * 4;
      }
    });
    
    // Score for company words in context
    companyWords.forEach(word => {
      if (word.length > 2 && fullContext.includes(word)) {
        score += 3;
      }
    });
    
    // Bonus for official indicators
    const officialIndicators = ['official', 'website', 'homepage', 'corporate', 'company site'];
    officialIndicators.forEach(indicator => {
      if (fullContext.includes(indicator)) {
        score += 8;
      }
    });
    
    // Bonus for earlier search results
    score += Math.max(0, 15 - context.position);
    
    // Bonus for reasonable domain length
    if (domain.length < 20) {
      score += 5;
    } else if (domain.length > 35) {
      score -= 8;
    }
    
    return score;
  }
}

module.exports = BrightDataService;