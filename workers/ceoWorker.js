// workers/ceoWorker.js - FIXED VERSION
const BrightDataService = require('../services/brightdata');
const OpenAIService = require('../services/openai');
const cache = require('../services/cache');
const { supabase } = require('../utils/database'); // FIXED: Destructure supabase

const brightData = new BrightDataService();
const openAI = new OpenAIService();

module.exports = async function(job) {
  const { leadId, domain, company, userId, retryCount = 0 } = job.data;
  
  console.log(`👔 CEO worker started for lead ${leadId}: ${company} (${domain})`);
  
  try {
    // Update status to processing
    await supabase
      .from('leads')
      .update({ status: 'processing' })
      .eq('id', leadId);
    
    const cacheKey = `ceo:${domain.toLowerCase()}`;
    const cachedCEO = await cache.get(cacheKey);
    
    if (cachedCEO && cachedCEO !== 'NOT_FOUND') {
      console.log(`✅ Using cached CEO for ${domain}: ${cachedCEO}`);
      
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

    console.log(`🔍 Searching for CEO of ${company} (${domain}) using Bright Data`);
    const searchResults = await brightData.findCEO(domain, company);
    
    if (!searchResults || searchResults.length < 100) {
      console.log(`❌ No/insufficient search results for ${company} (${searchResults?.length || 0} chars)`);
      await cache.set(cacheKey, 'NOT_FOUND', 3600);
      return await handleFailure(leadId, userId, retryCount);
    }

    console.log(`🤖 Using OpenAI to extract CEO name from search results (${searchResults.length} chars)`);
    const ceoName = await openAI.extractCEOName(domain, company, searchResults);
    
    if (ceoName && ceoName.trim()) {
      console.log(`✅ CEO found for ${company}: ${ceoName}`);
      
      await cache.set(cacheKey, ceoName, 2592000); // Cache for 30 days
      
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
      console.log(`❌ No CEO name extracted for ${company}`);
      await cache.set(cacheKey, 'NOT_FOUND', 3600);
      return await handleFailure(leadId, userId, retryCount);
    }
    
  } catch (error) {
    console.error(`❌ CEO worker error for lead ${leadId}:`, error);
    return await handleFailure(leadId, userId, retryCount);
  }
};

async function handleFailure(leadId, userId, retryCount) {
  // FIXED: Use the already imported supabase instead of requiring again
  try {
    if (retryCount === 0) {
      console.log(`🔄 First failure for lead ${leadId}, releasing for retry`);
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
      console.log(`❌ Second failure for lead ${leadId}, marking as failed`);
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
  } catch (dbError) {
    console.error(`❌ Database error in handleFailure for lead ${leadId}:`, dbError.message);
    throw dbError;
  }
}