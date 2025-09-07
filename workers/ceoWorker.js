const { supabase } = require('../utils/database');
const BrightDataService = require('../services/brightdata');
const OpenAIService = require('../services/openai');
const cacheService = require('../services/cache');

async function ceoWorker(job) {
  const { leadId, domain, company } = job.data;
  
  console.log(`👔 CEO worker processing lead ${leadId}: ${company} (${domain})`);
  
  try {
    // Check cache first
    const cacheKey = `ceo:${domain.toLowerCase()}`;
    const cachedCEO = await cacheService.getCEO ? await cacheService.getCEO(domain) : null;
    
    if (cachedCEO) {
      console.log(`🎯 Using cached CEO for ${domain}: ${cachedCEO}`);
      await updateLeadWithCEO(leadId, cachedCEO);
      return { success: true, ceo: cachedCEO, source: 'cache' };
    }
    
    // Search for CEO using Bright Data + OpenAI
    console.log(`🔍 Searching for CEO of ${company} (${domain}) using Bright Data`);
    
    const brightData = new BrightDataService();
    const searchText = await brightData.findCEO(company, domain);
    
    if (searchText) {
      console.log(`✅ Got search text, extracting CEO with OpenAI...`);
      
      const openai = new OpenAIService();
      const ceoName = await openai.extractCEOFromText(searchText, company);
      
      if (ceoName) {
        console.log(`✅ CEO found: ${ceoName}`);
        
        // Cache the result
        if (cacheService.setCEO) {
          await cacheService.setCEO(domain, ceoName);
        }
        
        // Update lead with CEO
        await updateLeadWithCEO(leadId, ceoName);
        
        return { success: true, ceo: ceoName, source: 'brightdata+openai' };
      } else {
        console.log(`❌ No CEO extracted from search results for: ${company}`);
        
        // Cache negative result
        if (cacheService.setCEO) {
          await cacheService.setCEO(domain, null);
        }
        
        await updateLeadStatus(leadId, 'completed');
        return { success: false, error: 'CEO not found' };
      }
    } else {
      console.log(`❌ No search results for CEO of: ${company}`);
      
      // Cache negative result
      if (cacheService.setCEO) {
        await cacheService.setCEO(domain, null);
      }
      
      await updateLeadStatus(leadId, 'completed');
      return { success: false, error: 'No search results' };
    }
    
  } catch (error) {
    console.error(`❌ CEO worker error for lead ${leadId}:`, error);
    await updateLeadStatus(leadId, 'failed');
    return { success: false, error: error.message };
  }
}

async function updateLeadWithCEO(leadId, ceoName) {
  try {
    const { error } = await supabase
      .from('leads')
      .update({
        ceo_name: ceoName,
        status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) {
      console.error(`❌ Failed to update lead ${leadId} with CEO:`, error);
    } else {
      console.log(`✅ Updated lead ${leadId} with CEO: ${ceoName}`);
    }
  } catch (error) {
    console.error(`❌ Error updating lead ${leadId}:`, error);
  }
}

async function updateLeadStatus(leadId, status) {
  try {
    const { error } = await supabase
      .from('leads')
      .update({ 
        status: status,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (error) {
      console.error(`❌ Failed to update lead ${leadId} status:`, error);
    } else {
      console.log(`✅ Updated lead ${leadId} status to: ${status}`);
    }
  } catch (error) {
    console.error(`❌ Error updating lead ${leadId} status:`, error);
  }
}

module.exports = { ceoWorker };