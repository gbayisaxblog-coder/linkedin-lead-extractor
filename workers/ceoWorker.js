// workers/ceoWorker.js - ENHANCED WITH IMMEDIATE DB UPDATES
const BrightDataService = require('../services/brightdata');
const OpenAIService = require('../services/openai');
const cache = require('../services/cache');
const { supabase } = require('../utils/database');

const brightData = new BrightDataService();
const openAI = new OpenAIService();

module.exports = async function(job) {
  const { leadId, domain, company, userId, retryCount = 0 } = job.data;
  
  console.log(`👔 CEO worker started for lead ${leadId}: ${company} (${domain})`);
  console.log(`🔍 CEO worker timestamp: ${new Date().toISOString()}`);
  
  try {
    // STEP 1: Update status to processing
    console.log(`📝 STEP 1: Updating CEO lead ${leadId} to processing...`);
    const { data: statusUpdate, error: statusError } = await supabase
      .from('leads')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select();
    
    if (statusError) {
      console.error(`❌ CEO status update failed:`, statusError);
      throw statusError;
    }
    console.log(`✅ CEO status updated:`, statusUpdate);
    
    // STEP 2: Check cache
    const cacheKey = `ceo:${domain.toLowerCase()}`;
    console.log(`🔍 STEP 2: Checking CEO cache: ${cacheKey}`);
    
    let cachedCEO = null;
    try {
      cachedCEO = await cache.get(cacheKey);
      console.log(`🔍 CEO cache result: ${cachedCEO || 'No cached CEO'}`);
    } catch (cacheError) {
      console.error(`⚠️ CEO cache error:`, cacheError.message);
    }
    
    if (cachedCEO && cachedCEO !== 'NOT_FOUND') {
      console.log(`✅ Using cached CEO: ${cachedCEO}`);
      
      // IMMEDIATE database update with cached CEO
      const { data: ceoUpdate, error: ceoUpdateError } = await supabase
        .from('leads')
        .update({
          ceo_name: cachedCEO,
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .select();
      
      if (ceoUpdateError) {
        console.error(`❌ Failed to update with cached CEO:`, ceoUpdateError);
        throw ceoUpdateError;
      }
      
      console.log(`🎉 DATABASE UPDATED with cached CEO: ${cachedCEO}`);
      console.log(`✅ Cached CEO update confirmation:`, ceoUpdate);
      
      return { success: true, ceo: cachedCEO, cached: true };
    }

    // STEP 3: Search for CEO
    console.log(`🔍 STEP 3: Searching for CEO of ${company} (${domain})`);
    
    let searchResults = null;
    try {
      searchResults = await brightData.findCEO(domain, company);
      console.log(`🔍 CEO search results: ${searchResults ? `${searchResults.length} chars` : 'No results'}`);
    } catch (searchError) {
      console.error(`❌ CEO search error:`, searchError.message);
    }
    
    if (!searchResults || searchResults.length < 100) {
      console.log(`❌ Insufficient CEO search results (${searchResults?.length || 0} chars)`);
      
      try {
        await cache.set(cacheKey, 'NOT_FOUND', 3600);
        console.log(`✅ Cached NOT_FOUND for ${domain}`);
      } catch (cacheError) {
        console.error(`⚠️ Failed to cache NOT_FOUND:`, cacheError.message);
      }
      
      return await handleFailure(leadId, userId, retryCount);
    }

    // STEP 4: Extract CEO name
    console.log(`🤖 STEP 4: Extracting CEO name (${searchResults.length} chars)...`);
    
    let ceoName = null;
    try {
      ceoName = await openAI.extractCEOName(domain, company, searchResults);
      console.log(`🔍 OpenAI CEO result: ${ceoName || 'No CEO extracted'}`);
    } catch (openaiError) {
      console.error(`❌ OpenAI error:`, openaiError.message);
    }
    
    if (ceoName && ceoName.trim()) {
      console.log(`✅ CEO found: ${ceoName}`);
      
      // STEP 5: Cache the CEO
      try {
        await cache.set(cacheKey, ceoName, 2592000);
        console.log(`✅ CEO cached: ${ceoName}`);
      } catch (cacheError) {
        console.error(`⚠️ CEO cache error:`, cacheError.message);
      }
      
      // STEP 6: IMMEDIATE database update with CEO
      console.log(`📝 STEP 6: IMMEDIATELY updating database with CEO: ${ceoName}`);
      
      try {
        const { data: finalUpdate, error: finalError } = await supabase
          .from('leads')
          .update({
            ceo_name: ceoName,
            status: 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('id', leadId)
          .select();
        
        if (finalError) {
          console.error(`❌ CRITICAL: CEO database update failed:`, finalError);
          throw finalError;
        }
        
        console.log(`🎉 DATABASE IMMEDIATELY UPDATED with CEO: ${ceoName}`);
        console.log(`✅ CEO update confirmation:`, finalUpdate);
        
        return { success: true, ceo: ceoName, cached: false };
        
      } catch (dbError) {
        console.error(`❌ CRITICAL CEO DATABASE ERROR:`, dbError);
        throw dbError;
      }
      
    } else {
      console.log(`❌ No CEO name extracted`);
      
      try {
        await cache.set(cacheKey, 'NOT_FOUND', 3600);
        console.log(`✅ Cached NOT_FOUND`);
      } catch (cacheError) {
        console.error(`⚠️ Cache NOT_FOUND error:`, cacheError.message);
      }
      
      return await handleFailure(leadId, userId, retryCount);
    }
    
  } catch (error) {
    console.error(`❌ CEO WORKER CRITICAL ERROR for ${leadId}:`, error);
    console.error(`❌ CEO error stack:`, error.stack);
    return await handleFailure(leadId, userId, retryCount);
  }
};

async function handleFailure(leadId, userId, retryCount) {
  console.log(`🔄 CEO handleFailure for ${leadId}, retry: ${retryCount}`);
  
  try {
    if (retryCount === 0) {
      console.log(`🔄 First CEO failure, releasing for retry`);
      
      const { data: releaseUpdate, error: releaseError } = await supabase
        .from('leads')
        .update({
          status: 'released',
          released_by: userId,
          retry_count: 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .select();
      
      if (releaseError) {
        console.error(`❌ Release update failed:`, releaseError);
      } else {
        console.log(`✅ Lead released:`, releaseUpdate);
      }
      
      return { success: false, action: 'released' };
    } else {
      console.log(`❌ Second CEO failure, marking as failed`);
      
      const { data: failUpdate, error: failError } = await supabase
        .from('leads')
        .update({
          status: 'failed',
          released_by: userId,
          retry_count: 2,
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId)
        .select();
      
      if (failError) {
        console.error(`❌ Fail update failed:`, failError);
      } else {
        console.log(`✅ Lead marked as failed:`, failUpdate);
      }
      
      return { success: false, action: 'failed' };
    }
  } catch (dbError) {
    console.error(`❌ HandleFailure database error:`, dbError);
    throw dbError;
  }
}