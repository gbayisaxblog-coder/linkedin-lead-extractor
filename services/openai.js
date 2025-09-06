const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('🤖 OpenAI service initialized');
  }

  async extractCEOName(domain, company, visibleText) {
    console.log(`🤖 Extracting CEO name for ${company} using OpenAI`);
    
    const prompt = `You are given visible text from web search results for a company's top executive.

- Company: ${company}
- Domain: ${domain}

Return ONLY the full name of the highest-ranking executive of this exact company (CEO, President, Managing Partner, or Executive Director). 
Ignore people from other companies.
If you cannot find a specific person's name, return 'NOT_FOUND'.
Do not return explanations or sentences.

Visible text:
${visibleText}

Output: just the full name or NOT_FOUND`;

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 100
      });

      const raw = response.choices[0].message.content?.trim() || '';
      
      if (raw.toUpperCase().includes('NOT_FOUND')) {
        console.log(`❌ OpenAI: No CEO found for ${company}`);
        return '';
      }

      const cleanedName = this.extractCleanFullName(raw);
      console.log(`✅ OpenAI extracted CEO for ${company}: ${cleanedName || 'none'}`);
      
      return cleanedName;
    } catch (error) {
      console.error(`❌ OpenAI error for ${company}:`, error.message);
      return '';
    }
  }

  extractCleanFullName(raw) {
    if (!raw) return '';
    
    let s = raw.trim();
    
    const negativePatterns = [
      "there is no", "no information", "not found", "unable to", "unknown"
    ];
    
    if (negativePatterns.some(p => s.toLowerCase().includes(p))) {
      return '';
    }
    
    s = s.replace(/^['"""'[(]+|['"""'\])]+$/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/\b(Jr\.?|Sr\.?|III|II|IV|CEO|President|Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\b/gi, '');
    s = s.trim();
    
    const tokens = s.split(' ');
    
    if (tokens.length < 2 || tokens.length > 4) {
      return '';
    }
    
    for (const token of tokens) {
      if (!token || token[0] !== token[0].toUpperCase()) {
        return '';
      }
      if (token.length > 20 || token.length < 2) {
        return '';
      }
    }
    
    if (!/^[A-Za-z\s'-]+$/.test(s)) {
      return '';
    }
    
    return s;
  }
}

module.exports = OpenAIService;