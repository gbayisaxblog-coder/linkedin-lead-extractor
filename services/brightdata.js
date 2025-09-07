// services/brightdata.js - FIXED WITH RELAXED PRE-FILTERING
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
      
      const allDomains = this.extractAllDomainsWithContext(searchResults, companyName);
      
      if (allDomains.length === 0) {
        console.log(`❌ No domains found in search results for: ${companyName}`);
        return null;
      }
      
      console.log(`🔍 Found ${allDomains.length} potential domains for ${companyName}:`, 
        allDomains.slice(0, 8).map(d => d.domain));
      
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
      const resultPatterns = [
        /<div[^>]*class="[^"]*g[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*data-ved="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*jscontroller[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      ];
      
      let allMatches = [];
      resultPatterns.forEach(pattern => {
        const matches = html.match(pattern) || [];
        allMatches = allMatches.concat(matches);
      });
      
      const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
      let linkMatch;
      while ((linkMatch = linkPattern.exec(html)) !== null) {
        const url = linkMatch[1];
        const linkText = linkMatch[2];
        
        if (url.includes('http') && !url.includes('google.com') && !url.includes('youtube.com')) {
          allMatches.push(`<div>${linkText} ${url}</div>`);
        }
      }
      
      allMatches.forEach(match => {
        const block = {
          title: this.extractTitle(match),
          description: this.extractDescription(match),
          fullText: this.extractVisibleText(match)
        };
        
        if (block.title || block.description || block.fullText.length > 20) {
          blocks.push(block);
        }
      });
      
    } catch (error) {
      console.error('Block extraction error:', error.message);
    }
    
    return blocks.slice(0, 25);
  }

  extractDomainsFromBlock(block) {
    const domains = new Set();
    const text = `${block.title} ${block.description} ${block.fullText}`;
    
    const domainPatterns = [
      /https?:\/\/(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
      /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?=\s|$|\/|:)/g,
      /href=["'](https?:\/\/[^"'\/]+)/g,
      /(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\/|\s|$)/g,
      /url=([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g
    ];
    
    domainPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        try {
          let domain = match[2] || match[1];
          if (domain) {
            domain = domain.replace(/^www\./, '').toLowerCase().trim();
            domain = domain.split('/')[0];
            
            if (this.isValidDomain(domain) && this.isNotExcludedDomain(domain)) {
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

  isNotExcludedDomain(domain) {
    // Only exclude the most obvious non-company domains
    const excludeDomains = [
      'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 
      'instagram.com', 'tiktok.com', 'snapchat.com'
    ];
    
    return !excludeDomains.some(excluded => domain.includes(excluded));
  }

  async selectActualCompanyDomain(domainsWithContext, companyName) {
    console.log(`🤖 Analyzing ${domainsWithContext.length} domains for: ${companyName}`);
    
    // FIXED: Much more relaxed pre-filtering
    const relevantDomains = this.preFilterRelevantDomains(domainsWithContext, companyName);
    
    console.log(`🔍 Pre-filtered to ${relevantDomains.length} relevant domains:`, 
      relevantDomains.map(d => d.domain));
    
    if (relevantDomains.length === 0) {
      console.log(`⚠️ No domains passed pre-filter, using fallback with all domains`);
      // Fallback: Use all domains if pre-filter is too strict
      return this.fallbackDomainSelection(domainsWithContext, companyName);
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
- Any TLD is valid (.com, .net, .org, .co.uk, .gov, etc.)
- Look for the domain that clearly belongs to this specific company
- Government entities may have .gov domains

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
    
    // Enhanced fallback
    return this.fallbackDomainSelection(relevantDomains.length > 0 ? relevantDomains : domainsWithContext, companyName);
  }

  preFilterRelevantDomains(domainsWithContext, companyName) {
    const companyWords = this.normalizeCompanyName(companyName);
    const companyLower = companyName.toLowerCase();
    
    console.log(`🔍 Pre-filtering with company words: [${companyWords.join(', ')}]`);
    console.log(`🔍 Original company name: "${companyName}"`);
    
    const relevantDomains = domainsWithContext.filter(item => {
      const domain = item.domain.toLowerCase();
      const context = `${item.context.title} ${item.context.description} ${item.context.fullText}`.toLowerCase();
      
      console.log(`🔍 Checking domain: ${domain}`);
      console.log(`🔍 Context snippet: ${context.substring(0, 100)}...`);
      
      // Check 1: Any company word appears in domain (relaxed - even 2+ chars)
      const domainHasCompanyWord = companyWords.some(word => {
        if (word.length >= 2) {
          const hasWord = domain.includes(word);
          if (hasWord) {
            console.log(`✅ Domain contains company word "${word}": ${domain}`);
          }
          return hasWord;
        }
        return false;
      });
      
      // Check 2: Full company name appears in context
      const contextHasFullName = context.includes(companyLower);
      if (contextHasFullName) {
        console.log(`✅ Context contains full company name: ${domain}`);
      }
      
      // Check 3: Multiple company words in context (relaxed threshold)
      const contextWordMatches = companyWords.filter(word => 
        word.length >= 2 && context.includes(word)
      );
      const hasMultipleWords = contextWordMatches.length >= 1; // Relaxed from 2 to 1
      if (hasMultipleWords) {
        console.log(`✅ Context contains company words [${contextWordMatches.join(', ')}]: ${domain}`);
      }
      
      // Check 4: Company abbreviation in domain (relaxed)
      const abbreviation = companyWords.filter(w => w.length > 2).map(w => w[0]).join('');
      const domainHasAbbreviation = abbreviation.length >= 2 && domain.includes(abbreviation);
      if (domainHasAbbreviation) {
        console.log(`✅ Domain contains abbreviation "${abbreviation}": ${domain}`);
      }
      
      // Check 5: Partial company name matches (more flexible)
      const partialMatches = companyWords.filter(word => {
        if (word.length < 3) return false;
        for (let i = 3; i <= word.length; i++) {
          if (domain.includes(word.substring(0, i))) {
            console.log(`✅ Domain contains partial word "${word.substring(0, i)}" from "${word}": ${domain}`);
            return true;
          }
        }
        return false;
      });
      
      // Check 6: Special handling for government entities
      const isGovernment = companyName.toLowerCase().includes('governor') || 
                          companyName.toLowerCase().includes('government') ||
                          companyName.toLowerCase().includes('office of');
      const hasGovDomain = domain.includes('.gov');
      if (isGovernment && hasGovDomain) {
        console.log(`✅ Government entity with .gov domain: ${domain}`);
        return true;
      }
      
      // Check 7: Very relaxed - if domain appears early in results and context mentions any company word
      const earlyResult = item.context.position <= 5;
      const contextHasAnyWord = companyWords.some(word => word.length > 2 && context.includes(word));
      if (earlyResult && contextHasAnyWord) {
        console.log(`✅ Early result with company word match: ${domain}`);
        return true;
      }
      
      const isRelevant = domainHasCompanyWord || 
                        contextHasFullName || 
                        hasMultipleWords ||
                        domainHasAbbreviation ||
                        partialMatches.length >= 1;
      
      if (isRelevant) {
        console.log(`✅ Domain marked as relevant: ${domain}`);
      } else {
        console.log(`❌ Domain filtered out: ${domain}`);
      }
      
      return isRelevant;
    });
    
    return relevantDomains
      .map(item => ({
        ...item,
        relevanceScore: this.calculateDomainRelevanceScore(item, companyWords, companyName)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 8);
  }

  fallbackDomainSelection(domainsWithContext, companyName) {
    console.log(`🔧 Using enhanced fallback domain selection for: ${companyName}`);
    
    const companyWords = this.normalizeCompanyName(companyName);
    let bestMatch = null;
    let bestScore = 0;
    
    domainsWithContext.forEach(item => {
      const score = this.calculateDomainRelevanceScore(item, companyWords, companyName);
      
      console.log(`🔍 Fallback scoring - Domain: ${item.domain}, Score: ${score}`);
      
      if (score > bestScore && score > 3) { // Lowered threshold from 8 to 3
        bestScore = score;
        bestMatch = item;
      }
    });
    
    if (bestMatch) {
      console.log(`🎯 Fallback selection: ${bestMatch.domain} (score: ${bestScore})`);
      return bestMatch.domain;
    }
    
    // Final fallback: Return the first domain if we have any
    if (domainsWithContext.length > 0) {
      const firstDomain = domainsWithContext[0].domain;
      console.log(`🎲 Final fallback - using first domain: ${firstDomain}`);
      return firstDomain;
    }
    
    return null;
  }

  normalizeCompanyName(companyName) {
    return companyName
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|lp|llp|group|international|global|solutions|services|systems|technologies|tech|office|executive)\b\.?/gi, '')
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
    
    console.log(`🔍 Scoring domain: ${domain}`);
    
    // High score for exact company name in context
    if (fullContext.includes(originalCompanyName.toLowerCase())) {
      score += 25;
      console.log(`  +25 for exact company name in context`);
    }
    
    // Score for company words in domain
    companyWords.forEach(word => {
      if (word.length >= 2 && domainLower.includes(word)) {
        const wordScore = word.length * 3;
        score += wordScore;
        console.log(`  +${wordScore} for word "${word}" in domain`);
      }
    });
    
    // Score for company words in context
    companyWords.forEach(word => {
      if (word.length >= 2 && fullContext.includes(word)) {
        score += 2;
        console.log(`  +2 for word "${word}" in context`);
      }
    });
    
    // Bonus for official indicators
    const officialIndicators = ['official', 'website', 'homepage', 'corporate', 'company site', 'home page', 'main site'];
    officialIndicators.forEach(indicator => {
      if (fullContext.includes(indicator)) {
        score += 6;
        console.log(`  +6 for official indicator "${indicator}"`);
      }
    });
    
    // Bonus for earlier search results
    const positionBonus = Math.max(0, 12 - context.position);
    score += positionBonus;
    console.log(`  +${positionBonus} for position ${context.position}`);
    
    // Bonus for reasonable domain length
    if (domain.length < 20) {
      score += 4;
      console.log(`  +4 for reasonable length`);
    } else if (domain.length > 35) {
      score -= 6;
      console.log(`  -6 for very long domain`);
    }
    
    // Special bonus for government domains
    if (originalCompanyName.toLowerCase().includes('governor') && domain.includes('.gov')) {
      score += 20;
      console.log(`  +20 for government entity with .gov domain`);
    }
    
    console.log(`  Final score: ${score}`);
    return score;
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
    
    score += Math.max(0, 15 - context.position);
    score += Math.min(8, context.fullText.length / 100);
    
    if (context.title && context.title.length > 5) score += 5;
    if (context.description && context.description.length > 10) score += 3;
    
    return score;
  }

  // CEO finding methods (enhanced from your Python script)
  async findCEO(domain, companyName) {
    console.log(`👔 Finding CEO: ${companyName} (${domain})`);
    
    try {
      const searchQueries = this.buildCEOSearchQueries(companyName, domain);
      console.log(`🔍 Will try ${searchQueries.length} CEO search strategies`);
      
      let bestSearchText = '';
      let searchAttempts = 0;
      
      // Try each query and keep the richest text (like your Python version)
      for (const query of searchQueries) {
        try {
          console.log(`🔍 CEO search ${++searchAttempts}/${searchQueries.length}: ${query}`);
          
          const searchText = await this.performCEOSearch(query);
          
          if (searchText && searchText.length > bestSearchText.length) {
            bestSearchText = searchText;
            console.log(`✅ Better CEO search text found (${searchText.length} chars)`);
          }
          
          // If we have enough text, we can stop early
          if (bestSearchText.length >= 400) {
            console.log(`✅ Sufficient CEO search text found, stopping early`);
            break;
          }
          
          // Small delay between searches
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
      // Primary queries with company name (based on your Python version)
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
      
      // Fallback: return text containing CEO keywords only
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