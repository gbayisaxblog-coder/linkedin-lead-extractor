// services/openai.js - ENHANCED CEO EXTRACTION
const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('🤖 OpenAI service initialized');
  }

  async extractCEOName(domain, company, visibleText) {
    console.log(`🤖 Extracting CEO name for ${company || domain} using OpenAI`);
    
    // Enhanced prompt based on your Python version
    const prompt = `You are given visible text from Google search results for a company's top executive.

- Company: ${company || domain}
- Domain: ${domain}

Return ONLY the full name of the highest-ranking executive of this exact company (CEO, President, Managing Partner, Executive Director, Chairman, or Founder). 

IMPORTANT RULES:
- Ignore people from other companies
- Look for titles like CEO, Chief Executive, President, Founder, Managing Director
- Return the person's full name only (first and last name)
- If you cannot find a specific person's name, return 'NOT_FOUND'
- Do not return explanations, titles, or sentences
- Do not return generic terms or descriptions

Visible text:
${visibleText}

Output: just the full name or NOT_FOUND`;

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-3.5-turbo", // Cost-optimized
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 100
      });

      const raw = response.choices[0].message.content?.trim() || '';
      
      if (raw.toUpperCase().includes('NOT_FOUND') || raw.toUpperCase().includes('NOT FOUND')) {
        console.log(`❌ OpenAI: No CEO found for ${company || domain}`);
        return '';
      }

      const cleanedName = this.extractCleanFullName(raw);
      console.log(`✅ OpenAI extracted CEO for ${company || domain}: ${cleanedName || 'none'}`);
      
      return cleanedName;
    } catch (error) {
      console.error(`❌ OpenAI error for ${company || domain}:`, error.message);
      return '';
    }
  }

  extractCleanFullName(raw) {
    if (!raw) return '';
    
    let s = raw.trim();
    
    // Enhanced negative patterns (from your Python version)
    const negativePatterns = [
      "there is no", "no information", "no specific", "not found",
      "no results", "not enough", "unfortunately", "the visible text",
      "does not contain", "no ceo", "no president", "cannot determine",
      "unable to", "not available", "unknown", "the highest-ranking",
      "visible text provided", "given text"
    ];
    
    const sLower = s.toLowerCase();
    if (negativePatterns.some(p => sLower.includes(p))) {
      return '';
    }
    
    // Check if it's a sentence rather than a name
    if (s.split(' ').length > 5) {
      const sentenceWords = ["the", "is", "was", "are", "were", "has", "have", "does", "did", 
                           "provided", "visible", "text", "executive", "information"];
      if (sentenceWords.some(word => sLower.includes(word))) {
        return '';
      }
    }
    
    // Clean the text (from your Python version)
    s = s.replace(/^['"""'[(]+|['"""'\])]+$/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    
    // Remove titles (enhanced from your Python version)
    s = s.replace(/\b(Jr\.?|Sr\.?|III|II|IV|CEO|President|Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Chief|Executive|Officer|Director|Founder|Chairman)\b/gi, '');
    s = s.trim();
    
    const tokens = s.split(' ');
    
    // Validate name structure (from your Python version)
    if (tokens.length < 2 || tokens.length > 4) {
      return '';
    }
    
    // Each token must be properly capitalized
    for (const token of tokens) {
      if (!token || token[0] !== token[0].toUpperCase()) {
        return '';
      }
      if (token.length > 20 || token.length < 2) {
        return '';
      }
    }
    
    // Must contain only letters, spaces, hyphens, and apostrophes
    if (!/^[A-Za-z\s'-]+$/.test(s)) {
      return '';
    }
    
    return s;
  }
}

module.exports = OpenAIService;