// workers/domainWorker.js - BULLETPROOF VERSION
const BrightDataService = require('../services/brightdata');
const cache = require('../services/cache');
const { supabase } = require('../utils/database');

const brightData = new BrightDataService();

module.exports = async function(job) {
  console.log(`🌐 Domain worker processing job ${job.id} with data:`, job.data);
  
  // Validate job data
  if (!job.data) {
    throw new Error('No job data provided');
  }
  
  const { leadId, company, userId } = job.data;
  
  // Validate required fields
  if (!leadId) {
    throw new Error('leadId is required');
  }
  
  if (!company) {
    throw new Error('company is required');
  }
  
  console.log(`🌐 Domain worker started for lead ${leadId}: ${company}`);
  
  try {
    // Update status to processing
    await supabase
      .from('leads')
      .update({ status: 'processing' })
      .eq('id', leadId);
    
    const cacheKey = `domain:${company.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let domain = await cache.get(cacheKey);
    
    if (!domain) {
      console.log(`🔍 Searching for domain of: ${company}`);
      domain = await brightData.findDomain(company);
      
      if (domain) {
        await cache.set(cacheKey, domain, 604800); // Cache for 7 days
        console.log(`✅ Found and cached domain: ${domain}`);
      } else {
        console.log(`❌ No domain found for: ${company}`);
      }
    } else {
      console.log(`✅ Using cached domain: ${domain}`);
    }
    
    if (domain) {
      // Update lead with domain
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          domain: domain,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      if (updateError) {
        throw updateError;
      }
      
      // Queue CEO finding job
      try {
        const { ceoQueue } = require('../utils/queue');
        if (ceoQueue) {
          const ceoJobData = {
            leadId,
            domain,
            company,
            userId: userId || 'system',
            retryCount: 0
          };
          
          console.log(`🔄 Queueing CEO job with data:`, ceoJobData);
          
          const ceoJob = await ceoQueue.add('find-ceo', ceoJobData, {
            delay: Math.random() * 3000 // Random delay 0-3 seconds
          });
          
          console.log(`✅ Queued CEO job ${ceoJob.id} for lead ${leadId}: ${domain}`);
        }
      } catch (ceoQueueError) {
        console.error(`❌ Failed to queue CEO job for lead ${leadId}:`, ceoQueueError.message);
      }
      
      return { success: true, domain, leadId, company };
    } else {
      // Mark as failed if no domain found
      await supabase
        .from('leads')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      console.log(`❌ Lead ${leadId} marked as failed - no domain found`);
      return { success: false, error: 'No domain found', leadId, company };
    }
    
  } catch (error) {
    console.error(`❌ Domain worker error for lead ${leadId}:`, error);
    
    // Mark as failed
    try {
      await supabase
        .from('leads')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
    } catch (dbError) {
      console.error(`❌ Failed to update lead status:`, dbError);
    }
    
    throw error;
  }
};