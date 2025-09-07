const { supabase } = require('../utils/database');
const BrightDataService = require('../services/brightdata');
const cacheService = require('../services/cache');
const { ceoQueue } = require('../utils/queue');

async function domainWorker(job) {
  const { leadId, company } = job.data;
  
  console.log(`🌐 Domain worker processing lead ${leadId}: ${company}`);
  
  try {
    // Check cache first
    const cachedDomain = await cacheService.getDomain(company);
    if (cachedDomain) {
      console.log(`🎯 Using cached domain for ${company}: ${cachedDomain}`);
      
      await updateLeadWithDomain(leadId, cachedDomain);
      
      if (cachedDomain) {
        await queueCEOJob(leadId, cachedDomain, company);
      }
      
      return { success: true, domain: cachedDomain, source: 'cache' };
    }
    
    // Search for domain using Bright Data
    console.log(`🔍 Searching for REAL domain of: ${company}`);
    const brightData = new BrightDataService();
    const domain = await brightData.findDomain(company);
    
    // Cache the result
    await cacheService.setDomain(company, domain);
    
    // Update lead with domain
    await updateLeadWithDomain(leadId, domain);
    
    if (domain) {
      console.log(`✅ Found and cached domain: ${domain}`);
      
      // Queue CEO finding job
      await queueCEOJob(leadId, domain, company);
      
      return { success: true, domain: domain, source: 'brightdata' };
    } else {
      console.log(`❌ No domain found for: ${company}`);
      return { success: false, error: 'Domain not found' };
    }
    
  } catch (error) {
    console.error(`❌ Domain worker error for lead ${leadId}:`, error);
    
    await updateLeadStatus(leadId, 'failed');
    
    return { success: false, error: error.message };
  }
}

async function updateLeadWithDomain(leadId, domain) {
  try {
    const updates = {
      domain: domain,
      status: domain ? 'processing' : 'failed',
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId);
    
    if (error) {
      console.error(`❌ Failed to update lead ${leadId} with domain:`, error);
    } else {
      console.log(`✅ Updated lead ${leadId} with domain: ${domain || 'none'}`);
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

async function queueCEOJob(leadId, domain, company) {
  try {
    await ceoQueue.add('findCEO', {
      leadId: leadId,
      domain: domain,
      company: company
    });
    
    console.log(`✅ Queued CEO job for lead ${leadId}: ${domain}`);
  } catch (error) {
    console.error(`❌ Failed to queue CEO job for lead ${leadId}:`, error);
  }
}

module.exports = { domainWorker };