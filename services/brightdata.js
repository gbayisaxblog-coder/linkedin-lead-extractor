// services/brightdata.js - COST-OPTIMIZED INTELLIGENT DOMAIN FINDING
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
        format: 'raw'
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

  extractAllDomainsWithContext(html, companyName) {
    const domainsWithContext = [];
    
    try {
      // Extract search result blocks (each result has title, URL, description)
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
      
      // Remove duplicates while keeping best context
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
      // Enhanced patterns to extract Google search results with better accuracy
      const resultPatterns = [
        // Main search result divs
        /<div[^>]*class="[^"]*g[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Alternative result containers
        /<div[^>]*data-ved="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Organic result containers
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
        
        // Only include blocks with meaningful content
        if (block.title || block.description || block.fullText.length > 30) {
          blocks.push(block);
        }
      });
      
    } catch (error) {
      console.error('Block extraction error:', error.message);
    }
    
    return blocks.slice(0, 20); // Get more results for better analysis
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
      // Standard HTTP/HTTPS URLs
      /https?:\/\/(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
      // Domains in text (with word boundaries)
      /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?=\s|$|\/|:)/g,
      // Href attributes
      /href=["'](https?:\/\/[^"'\/]+)/g,
      // URL patterns without protocol
      /(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\/|\s|$)/g
    ];
    
    domainPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        try {
          let domain = match[2] || match[1];
          if (domain) {
            // Clean and normalize domain
            domain = domain.replace(/^www\./, '').toLowerCase().trim();
            
            // Remove trailing slashes or paths
            domain = domain.split('/')[0];
            
            // Validate domain format
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
    // Comprehensive domain validation
    return domain.includes('.') && 
           domain.length > 3 && 
           domain.length < 100 &&
           /^[a-zA-Z0-9.-]+$/.test(domain) &&
           !domain.startsWith('.') &&
           !domain.endsWith('.') &&
           !domain.includes('..') &&
           // Must have valid TLD
           /\.[a-zA-Z]{2,}$/.test(domain);
  }

  deduplicateDomainsWithBestContext(domainsWithContext) {
    const domainMap = new Map();
    
    domainsWithContext.forEach(item => {
      const domain = item.domain;
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, item);
      } else {
        // Keep the one with better context (earlier position, more context)
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
    
    // COST OPTIMIZATION: Pre-filter to most relevant domains
    const relevantDomains = this.preFilterRelevantDomains(domainsWithContext, companyName);
    
    console.log(`🔍 Pre-filtered to ${relevantDomains.length} relevant domains`);
    
    if (relevantDomains.length === 0) {
      console.log(`❌ No relevant domains found after pre-filtering`);
      return null;
    }
    
    if (relevantDomains.length === 1) {
      console.log(`✅ Only one relevant domain found: ${relevantDomains[0].domain}`);
      return relevantDomains[0].domain;
    }
    
    // Use AI only for final selection among pre-filtered candidates
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Compact prompt for cost efficiency
      const domainList = relevantDomains.map((item, i) => 
        `${i + 1}. ${item.domain} - ${item.context.title || 'No title'}`
      ).join('\n');
      
      const prompt = `Company: "${companyName}"
Domains from Google search:
${domainList}

Which domain is the actual official website for "${companyName}"?
- Company name may be abbreviated or slightly different in domain
- Any TLD is valid (.com, .net, .org, .co.uk, etc.)
- Look for the domain that clearly belongs to this specific company
- Consider context clues in titles

Respond with just the domain name or "NONE".`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Cost-optimized model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50 // Reduced for cost savings
      });

      const selectedDomain = response.choices[0].message.content?.trim().toLowerCase();
      
      if (selectedDomain && selectedDomain !== 'none') {
        // Verify the selected domain exists in our candidates
        const matchingDomain = relevantDomains.find(item => 
          item.domain.toLowerCase() === selectedDomain
        );
        
        if (matchingDomain) {
          console.log(`🎯 AI selected actual company domain: ${selectedDomain}`);
          console.log(`🔍 Context: ${matchingDomain.context.title}`);
          return selectedDomain;
        } else {
          console.log(`⚠️ AI selected domain not in candidates: ${selectedDomain}`);
        }
      } else {
        console.log(`❌ AI determined no actual company domain exists for: ${companyName}`);
      }
      
    } catch (aiError) {
      console.error('❌ AI domain analysis failed:', aiError.message);
    }
    
    // Fallback: Use intelligent scoring without AI
    return this.fallbackDomainSelection(relevantDomains, companyName);
  }

  preFilterRelevantDomains(domainsWithContext, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    const companyLower = companyName.toLowerCase();
    
    console.log(`🔍 Pre-filtering with company words: ${companyWords.join(', ')}`);
    
    const relevantDomains = domainsWithContext.filter(item => {
      const domain = item.domain.toLowerCase();
      const context = `${item.context.title} ${item.context.description}`.toLowerCase();
      
      // Check 1: Company name appears in domain
      const domainHasCompanyWord = companyWords.some(word => 
        word.length > 2 && domain.includes(word)
      );
      
      // Check 2: Full company name appears in context
      const contextHasFullName = context.includes(companyLower);
      
      // Check 3: Multiple company words appear in context
      const contextWordMatches = companyWords.filter(word => 
        word.length > 2 && context.includes(word)
      ).length;
      
      // Check 4: Company abbreviation in domain
      const abbreviation = companyWords.map(w => w[0]).join('');
      const domainHasAbbreviation = abbreviation.length >= 2 && domain.includes(abbreviation);
      
      // Check 5: Partial company name matches
      const partialMatches = companyWords.filter(word => {
        if (word.length < 4) return false;
        // Check if domain contains significant part of the word
        for (let i = 3; i <= word.length; i++) {
          if (domain.includes(word.substring(0, i))) {
            return true;
          }
        }
        return false;
      }).length;
      
      const isRelevant = domainHasCompanyWord || 
                        contextHasFullName || 
                        contextWordMatches >= 2 ||
                        domainHasAbbreviation ||
                        partialMatches >= 1;
      
      if (isRelevant) {
        console.log(`✅ Relevant: ${domain} - matches: ${domainHasCompanyWord ? 'domain' : ''} ${contextHasFullName ? 'context' : ''} ${contextWordMatches >= 2 ? 'words' : ''}`);
      }
      
      return isRelevant;
    });
    
    // Sort by relevance score and take top candidates
    return relevantDomains
      .map(item => ({
        ...item,
        relevanceScore: this.calculateDomainRelevanceScore(item, companyWords, companyName)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Limit to top 5 for AI analysis
  }

  fallbackDomainSelection(domainsWithContext, companyName) {
    console.log(`🔧 Using fallback domain selection for: ${companyName}`);
    
    const companyWords = this.normalizeCompanyName(companyName);
    let bestMatch = null;
    let bestScore = 0;
    
    domainsWithContext.forEach(item => {
      const score = this.calculateDomainRelevanceScore(item, companyWords, companyName);
      
      console.log(`🔍 Domain: ${item.domain}, Score: ${score}`);
      
      if (score > bestScore && score > 8) { // Higher minimum threshold
        bestScore = score;
        bestMatch = item;
      }
    });
    
    if (bestMatch) {
      console.log(`🎯 Best fallback match: ${bestMatch.domain} (score: ${bestScore})`);
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
    
    // Score based on company word matches in domain
    companyWords.forEach(word => {
      if (word.length > 2 && domainLower.includes(word)) {
        score += word.length * 4; // Higher score for longer word matches
      }
    });
    
    // Score for partial word matches in domain
    companyWords.forEach(word => {
      if (word.length >= 4) {
        for (let i = 3; i <= word.length; i++) {
          if (domainLower.includes(word.substring(0, i))) {
            score += i; // Score based on match length
            break;
          }
        }
      }
    });
    
    // Score based on company words in context
    companyWords.forEach(word => {
      if (word.length > 2 && fullContext.includes(word)) {
        score += 3;
      }
    });
    
    // Bonus for official indicators in context
    const officialIndicators = ['official', 'website', 'homepage', 'corporate', 'company site', 'main site', 'home page'];
    officialIndicators.forEach(indicator => {
      if (fullContext.includes(indicator)) {
        score += 8;
      }
    });
    
    // Bonus for earlier search results (higher relevance)
    score += Math.max(0, 15 - context.position);
    
    // Bonus for shorter domains (usually main company sites)
    if (domain.length < 15) {
      score += 5;
    } else if (domain.length > 30) {
      score -= 8; // Penalty for very long domains
    }
    
    // Bonus for common business TLDs
    if (domain.endsWith('.com') || domain.endsWith('.net') || domain.endsWith('.org')) {
      score += 3;
    }
    
    return score;
  }

  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO: ${companyName} (${domain})`);
    
    try {
      // Enhanced CEO search query with multiple approaches
      const queries = [
        `"${companyName}" CEO "chief executive" site:${domain}`,
        `"${companyName}" CEO "chief executive officer"`,
        `"${companyName}" president founder`
      ];
      
      for (const query of queries) {
        console.log(`🔍 CEO search query: ${query}`);
        
        const response = await axios.post(this.baseURL, {
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`,
          format: 'raw'
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 45000
        });

        if (response.data && response.status === 200) {
          const searchText = this.extractCEORelevantText(response.data, companyName);
          
          if (searchText && searchText.length > 200) {
            console.log(`✅ CEO search results found for ${companyName} (${searchText.length} chars)`);
            return searchText;
          }
        }
        
        // Small delay between queries
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`❌ CEO search failed for ${companyName}:`, error.message);
    }
    
    console.log(`❌ No CEO results for: ${companyName}`);
    return '';
  }

  extractCEORelevantText(html, companyName) {
    try {
      // Extract visible text
      let visibleText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Find sentences that mention both the company and CEO-related terms
      const ceoKeywords = ['ceo', 'chief executive', 'president', 'founder', 'executive director', 'managing director', 'chairman'];
      const companyWords = this.normalizeCompanyName(companyName);
      
      const sentences = visibleText.split(/[.!?]/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        const hasCEOTerm = ceoKeywords.some(keyword => lowerSentence.includes(keyword));
        const hasCompanyReference = companyWords.some(word => 
          word.length > 3 && lowerSentence.includes(word)
        ) || lowerSentence.includes(companyName.toLowerCase());
        
        return hasCEOTerm && hasCompanyReference && sentence.length > 15;
      });
      
      if (sentences.length > 0) {
        const relevantText = sentences.slice(0, 12).join('. ');
        console.log(`📄 Extracted ${sentences.length} relevant CEO sentences`);
        return relevantText;
      }
      
      // Fallback: return text containing CEO keywords
      const ceoText = visibleText.split(/[.!?]/).filter(sentence => {
        const lowerSentence = sentence.toLowerCase();
        return ceoKeywords.some(keyword => lowerSentence.includes(keyword)) && sentence.length > 15;
      }).slice(0, 20).join('. ');
      
      return ceoText || visibleText.substring(0, 2000);
      
    } catch (error) {
      console.error('CEO text extraction error:', error.message);
      return '';
    }
  }
}

module.exports = BrightDataService;