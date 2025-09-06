const BrightDataService = require('../services/brightdata');
const OpenAIService = require('../services/openai');
const cache = require('../services/cache');
const supabase = require('../utils/database');

const brightData = new BrightDataService();
const openAI = new OpenAIService();

module.exports = async function(job) {
  const { leadId, domain, company, userId, retryCount = 0 } = job.data;
  
  try {
    const cacheKey = `ceo:${domain.toLowerCase()}`;
    const cachedCEO = await cache.get(cacheKey);
    
    if (cachedCEO && cachedCEO !== 'NOT_FOUND') {
      await supabase
        .from('leads')
        .update({
          ceo_name: cachedCEO,
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      return { success: true, ceo: cachedCEO, cached: true };
    }

    const searchResults = await brightData.findCEO(domain, company);
    
    if (!searchResults) {
      await cache.set(cacheKey, 'NOT_FOUND', 3600);
      return await handleFailure(leadId, userId, retryCount);
    }

    const ceoName = await openAI.extractCEOName(domain, company, searchResults);
    
    if (ceoName) {
      await cache.set(cacheKey, ceoName, 2592000);
      
      await supabase
        .from('leads')
        .update({
          ceo_name: ceoName,
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      return { success: true, ceo: ceoName, cached: false };
    } else {
      await cache.set(cacheKey, 'NOT_FOUND', 3600);
      return await handleFailure(leadId, userId, retryCount);
    }
    
  } catch (error) {
    console.error('CEO worker error:', error);
    return await handleFailure(leadId, userId, retryCount);
  }
};

async function handleFailure(leadId, userId, retryCount) {
  if (retryCount === 0) {
    await supabase
      .from('leads')
      .update({
        status: 'released',
        released_by: userId,
        retry_count: 1
      })
      .eq('id', leadId);
    
    return { success: false, action: 'released' };
  } else {
    await supabase
      .from('leads')
      .update({
        status: 'failed',
        released_by: userId,
        retry_count: 2,
        processed_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    return { success: false, action: 'failed' };
  }
}