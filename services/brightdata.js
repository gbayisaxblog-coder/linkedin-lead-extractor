// services/brightdata.js - ULTRA-ACCURATE DOMAIN FINDING
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
      
      console.log(`🔍 Found ${allDomains.length} potential domains for ${companyName}:`);
      allDomains.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.domain} - "${d.context.title}" (pos: ${d.context.position})`);
      });
      
      const actualDomain = await this.selectActualCompanyDomain(allDomains, companyName);
      
      if (actualDomain) {
        console.log(`✅ Actual domain selected: ${companyName} → ${actualDomain}`);
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
      // ENHANCED: Extract domains from multiple sources
      
      // Method 1: Extract from search result blocks
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
              position: index + 1,
              source: 'result_block'
            }
          });
        });
      });
      
      // Method 2: Extract directly from href attributes (catch more domains)
      const hrefDomains = this.extractDomainsFromHrefs(html);
      hrefDomains.forEach((domainInfo, index) => {
        domainsWithContext.push({
          domain: domainInfo.domain,
          context: {
            title: domainInfo.linkText || '',
            description: '',
            fullText: domainInfo.context || '',
            position: index + 1,
            source: 'href_direct'
          }
        });
      });
      
      // Method 3: Extract from plain text mentions
      const textDomains = this.extractDomainsFromPlainText(html);
      textDomains.forEach((domain, index) => {
        domainsWithContext.push({
          domain: domain,
          context: {
            title: '',
            description: '',
            fullText: '',
            position: index + 20, // Lower priority
            source: 'plain_text'
          }
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

  extractDomainsFromHrefs(html) {
    const domains = [];
    
    try {
      // Extract all href links with their context
      const hrefPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
      let match;
      
      while ((match = hrefPattern.exec(html)) !== null) {
        const url = match[1];
        const linkText = this.cleanText(match[2]);
        
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
          
          if (this.isValidDomain(domain) && this.isNotExcludedDomain(domain)) {
            domains.push({
              domain: domain,
              linkText: linkText,
              context: linkText
            });
          }
        } catch (urlError) {
          // Skip invalid URLs
        }
      }
      
      console.log(`🔍 Extracted ${domains.length} domains from hrefs`);
      return domains;
      
    } catch (error) {
      console.error('Href domain extraction error:', error.message);
      return [];
    }
  }

  extractDomainsFromPlainText(html) {
    const domains = new Set();
    
    try {
      // Remove HTML tags to get plain text
      const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      
      // Look for domain patterns in plain text
      const domainPattern = /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?=\s|$|\/|:)/g;
      let match;
      
      while ((match = domainPattern.exec(plainText)) !== null) {
        const domain = match[1].toLowerCase().trim();
        
        if (this.isValidDomain(domain) && this.isNotExcludedDomain(domain)) {
          domains.add(domain);
        }
      }
      
      console.log(`🔍 Extracted ${domains.size} domains from plain text`);
      return Array.from(domains);
      
    } catch (error) {
      console.error('Plain text domain extraction error:', error.message);
      return [];
    }
  }

  extractSearchResultBlocks(html) {
    const blocks = [];
    
    try {
      // ENHANCED: Better patterns to capture Google search results
      const resultPatterns = [
        // Main search results
        /<div[^>]*class="[^"]*g[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Organic results
        /<div[^>]*data-ved="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Modern Google results
        /<div[^>]*jscontroller[^>]*>([\s\S]*?)<\/div>/gi,
        // Alternative result containers
        /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        // Search result items
        /<div[^>]*class="[^"]*srp[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      ];
      
      let allMatches = [];
      resultPatterns.forEach(pattern => {
        const matches = html.match(pattern) || [];
        allMatches = allMatches.concat(matches);
      });
      
      console.log(`🔍 Found ${allMatches.length} potential result blocks`);
      
      allMatches.forEach((match, index) => {
        const block = {
          title: this.extractTitle(match),
          description: this.extractDescription(match),
          fullText: this.extractVisibleText(match)
        };
        
        // More lenient criteria for including blocks
        if (block.title || block.description || block.fullText.length > 15) {
          blocks.push(block);
        }
      });
      
      console.log(`🔍 Created ${blocks.length} valid blocks`);
      
    } catch (error) {
      console.error('Block extraction error:', error.message);
    }
    
    return blocks.slice(0, 30); // Increased to capture more results
  }

  extractDomainsFromBlock(block) {
    const domains = new Set();
    const text = `${block.title} ${block.description} ${block.fullText}`;
    
    // ENHANCED: More comprehensive domain extraction patterns
    const domainPatterns = [
      // HTTP/HTTPS URLs
      /https?:\/\/(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
      // Domains with word boundaries
      /(?:^|\s)((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?=\s|$|\/|:|,|\)|;)/g,
      // Href attributes
      /href=["'](https?:\/\/[^"'\/]+)/g,
      // Direct domain mentions
      /(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?=\/|\s|$|,|\)|;)/g,
      // URL parameters
      /url=([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g,
      // Domain mentions in text
      /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,})\b/g
    ];
    
    console.log(`🔍 Extracting domains from block with title: "${block.title}"`);
    
    domainPatterns.forEach((pattern, patternIndex) => {
      let match;
      const patternDomains = [];
      
      while ((match = pattern.exec(text)) !== null) {
        try {
          let domain = match[2] || match[1];
          if (domain) {
            domain = domain.replace(/^www\./, '').toLowerCase().trim();
            domain = domain.split('/')[0].split('?')[0]; // Remove paths and params
            
            if (this.isValidDomain(domain) && this.isNotExcludedDomain(domain)) {
              domains.add(domain);
              patternDomains.push(domain);
            }
          }
        } catch (error) {
          // Skip invalid domains
        }
      }
      
      if (patternDomains.length > 0) {
        console.log(`  Pattern ${patternIndex + 1} found: ${patternDomains.join(', ')}`);
      }
    });
    
    const domainArray = Array.from(domains);
    console.log(`🔍 Block extracted ${domainArray.length} domains: ${domainArray.join(', ')}`);
    
    return domainArray;
  }

  isValidDomain(domain) {
    // More comprehensive domain validation
    if (!domain || typeof domain !== 'string') return false;
    
    return domain.includes('.') && 
           domain.length > 3 && 
           domain.length < 100 &&
           /^[a-zA-Z0-9.-]+$/.test(domain) &&
           !domain.startsWith('.') &&
           !domain.endsWith('.') &&
           !domain.includes('..') &&
           /\.[a-zA-Z]{2,}$/.test(domain) &&
           // Must have at least one letter (not just numbers)
           /[a-zA-Z]/.test(domain);
  }

  isNotExcludedDomain(domain) {
    // FIXED: More comprehensive exclusion list
    const excludeDomains = [
      'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 
      'instagram.com', 'tiktok.com', 'snapchat.com', 'linkedin.com',
      'w3.org', 'wikipedia.org', 'github.com', 'stackoverflow.com',
      'reddit.com', 'quora.com', 'medium.com', 'wordpress.com',
      'blogspot.com', 'tumblr.com', 'pinterest.com', 'maps.google.com',
      'support.google.com', 'accounts.google.com', 'policies.google.com',
      'translate.google.com', 'scholar.google.com'
    ];
    
    return !excludeDomains.some(excluded => domain === excluded || domain.endsWith('.' + excluded));
  }

  async selectActualCompanyDomain(domainsWithContext, companyName) {
    console.log(`🤖 Analyzing ${domainsWithContext.length} domains for: ${companyName}`);
    
    // STEP 1: Remove obviously wrong domains
    const cleanDomains = domainsWithContext.filter(item => {
      const domain = item.domain.toLowerCase();
      
      const badDomains = ['w3.org', 'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com', 'github.com'];
      const isBad = badDomains.includes(domain);
      
      if (isBad) {
        console.log(`❌ EXCLUDED bad domain: ${domain}`);
        return false;
      }
      
      return true;
    });
    
    console.log(`🔍 After removing bad domains: ${cleanDomains.length} domains remain`);
    
    if (cleanDomains.length === 0) {
      console.log(`❌ No domains left after removing bad ones`);
      return null;
    }
    
    // STEP 2: Score all domains with enhanced algorithm
    const scoredDomains = cleanDomains.map(item => {
      const score = this.calculateEnhancedDomainScore(item, companyName);
      return { ...item, relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    console.log(`🔍 TOP SCORED DOMAINS:`);
    scoredDomains.slice(0, 5).forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.domain} = ${item.relevanceScore} points (${item.context.title})`);
    });
    
    // STEP 3: If we have a clear winner (high score), use it
    const topDomain = scoredDomains[0];
    if (topDomain && topDomain.relevanceScore > 15) {
      console.log(`✅ CLEAR WINNER: ${topDomain.domain} (${topDomain.relevanceScore} points)`);
      return topDomain.domain;
    }
    
    // STEP 4: Use AI for close decisions
    const topCandidates = scoredDomains.filter(d => d.relevanceScore > 5).slice(0, 5);
    
    if (topCandidates.length === 0) {
      console.log(`❌ No domains scored above minimum threshold`);
      return null;
    }
    
    if (topCandidates.length === 1) {
      console.log(`✅ Only one candidate above threshold: ${topCandidates[0].domain}`);
      return topCandidates[0].domain;
    }
    
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const domainList = topCandidates.map((item, i) => 
        `${i + 1}. ${item.domain} (Score: ${item.relevanceScore}) - "${item.context.title}"`
      ).join('\n');
      
      const prompt = `Company: "${companyName}"
Top domain candidates:
${domainList}

Which domain belongs to "${companyName}"? Look for:
- Exact company name matches
- Company abbreviations (e.g., "Meketa" for "Meketa Investment Group")
- Official company websites

Respond with just the domain name or "NONE".`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      });

      const selectedDomain = response.choices[0].message.content?.trim().toLowerCase();
      
      if (selectedDomain && selectedDomain !== 'none') {
        const matchingDomain = topCandidates.find(item => 
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
    
    // STEP 5: Final fallback - return highest scoring domain
    if (topCandidates.length > 0) {
      console.log(`🎯 Final fallback: ${topCandidates[0].domain} (${topCandidates[0].relevanceScore} points)`);
      return topCandidates[0].domain;
    }
    
    return null;
  }

  calculateEnhancedDomainScore(domainWithContext, companyName) {
    let score = 0;
    const { domain, context } = domainWithContext;
    const domainLower = domain.toLowerCase();
    const fullContext = `${context.title} ${context.description} ${context.fullText}`.toLowerCase();
    
    console.log(`🔍 SCORING: ${domain}`);
    
    // MASSIVE penalty for obviously wrong domains
    const badDomains = ['w3.org', 'wikipedia.org', 'linkedin.com', 'facebook.com', 'twitter.com', 'github.com', 'stackoverflow.com'];
    if (badDomains.includes(domainLower)) {
      score = -1000;
      console.log(`  PENALTY: -1000 for bad domain`);
      return score;
    }
    
    // Normalize company name for matching
    const companyWords = this.normalizeCompanyName(companyName);
    const companyLower = companyName.toLowerCase();
    
    // HUGE bonus for exact company name match in domain
    const mainCompanyWord = companyWords[0]; // First word usually most important
    if (mainCompanyWord && domainLower.includes(mainCompanyWord)) {
      score += 100;
      console.log(`  +100 for main company word "${mainCompanyWord}" in domain`);
    }
    
    // Score for each company word in domain
    companyWords.forEach(word => {
      if (word.length >= 3 && domainLower.includes(word)) {
        const wordScore = word.length * 15; // Increased multiplier
        score += wordScore;
        console.log(`  +${wordScore} for word "${word}" in domain`);
      }
    });
    
    // HUGE bonus for exact company name in context
    if (fullContext.includes(companyLower)) {
      score += 80;
      console.log(`  +80 for exact company name in context`);
    }
    
    // Score for company words in context
    companyWords.forEach(word => {
      if (word.length >= 3 && fullContext.includes(word)) {
        score += 8;
        console.log(`  +8 for word "${word}" in context`);
      }
    });
    
    // MASSIVE bonus for position 1 (first result)
    if (context.position === 1) {
      score += 50;
      console.log(`  +50 for being first result`);
    } else {
      const positionBonus = Math.max(0, 25 - context.position * 2);
      score += positionBonus;
      console.log(`  +${positionBonus} for position ${context.position}`);
    }
    
    // Bonus for official indicators
    const officialIndicators = ['official', 'website', 'homepage', 'corporate', 'company site'];
    officialIndicators.forEach(indicator => {
      if (fullContext.includes(indicator)) {
        score += 15;
        console.log(`  +15 for official indicator "${indicator}"`);
      }
    });
    
    // Bonus for reasonable domain length
    if (domain.length < 25) {
      score += 10;
      console.log(`  +10 for reasonable length`);
    } else if (domain.length > 40) {
      score -= 15;
      console.log(`  -15 for very long domain`);
    }
    
    // Bonus for common business TLDs
    if (domain.endsWith('.com')) {
      score += 8;
      console.log(`  +8 for .com TLD`);
    } else if (domain.endsWith('.net') || domain.endsWith('.org')) {
      score += 5;
      console.log(`  +5 for business TLD`);
    } else if (domain.endsWith('.gov')) {
      score += 30; // High bonus for government
      console.log(`  +30 for .gov TLD`);
    }
    
    console.log(`  FINAL SCORE: ${score}`);
    return score;
  }

  extractTitle(htmlBlock) {
    const titlePatterns = [
      /<h3[^>]*>(.*?)<\/h3>/i,
      /<a[^>]*><h3[^>]*>(.*?)<\/h3><\/a>/i,
      /<div[^>]*role="heading"[^>]*>(.*?)<\/div>/i,
      /<h1[^>]*>(.*?)<\/h1>/i,
      /<h2[^>]*>(.*?)<\/h2>/i,
      /<title[^>]*>(.*?)<\/title>/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = htmlBlock.match(pattern);
      if (match) {
        const title = this.cleanText(match[1]);
        if (title.length > 3) {
          return title;
        }
      }
    }
    
    return '';
  }

  extractDescription(htmlBlock) {
    const descPatterns = [
      /<span[^>]*class="[^"]*st[^"]*"[^>]*>(.*?)<\/span>/i,
      /<div[^>]*class="[^"]*s[^"]*"[^>]*>(.*?)<\/div>/i,
      /<p[^>]*>(.*?)<\/p>/i,
      /<span[^>]*data-ved[^>]*>(.*?)<\/span>/i,
      /<div[^>]*data-content-feature[^>]*>(.*?)<\/div>/i
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
    
    // Earlier results get much higher scores
    score += Math.max(0, 20 - context.position);
    
    // More context text gets higher scores
    score += Math.min(10, context.fullText.length / 80);
    
    // Having title and description gets bonus
    if (context.title && context.title.length > 5) score += 8;
    if (context.description && context.description.length > 10) score += 5;
    
    // Bonus for href source (direct links are more reliable)
    if (context.source === 'href_direct') score += 5;
    
    return score;
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