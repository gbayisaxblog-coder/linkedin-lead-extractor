// workers/domainWorker.js - UPDATED TO USE DATABLIST
const DatablistService = require('../services/datablist'); // CHANGED: Use Datablist instead of BrightData
const BrightDataService = require('../services/brightdata'); // Keep for CEO finding
const cache = require('../services/cache');
const { supabase } = require('../utils/database');

const datablist = new DatablistService(); // NEW: Datablist for domains
const brightData = new BrightDataService(); // Keep for CEO finding

module.exports = async function(job) {
  const { leadId, company, userId } = job.data;
  
  console.log(`🌐 Domain worker (Datablist) started for lead ${leadId}: ${company}`);
  console.log(`🔍 Worker timestamp: ${new Date().toISOString()}`);
  
  try {
    // STEP 1: Update status to processing
    console.log(`📝 STEP 1: Updating lead ${leadId} to processing...`);
    const { data: statusUpdate, error: statusError } = await supabase
      .from('leads')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select();
    
    if (statusError) {
      console.error(`❌ Failed to update status:`, statusError);
      throw statusError;
    }
    console.log(`✅ Status updated to processing:`, statusUpdate);
    
    // STEP 2: Check cache
    const cacheKey = `domain:${company.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    console.log(`🔍 STEP 2: Checking cache key: ${cacheKey}`);
    
    let domain = null;
    try {
      domain = await cache.get(cacheKey);
      console.log(`🔍 Cache result: ${domain || 'No cached domain'}`);
    } catch (cacheError) {
      console.error(`⚠️ Cache error:`, cacheError.message);
    }
    
    // STEP 3: Find domain if not cached - NOW USING DATABLIST
    if (!domain) {
      console.log(`🔍 STEP 3: Using Datablist to find domain for: ${company}`);
      
      try {
        domain = await datablist.findDomain(company); // CHANGED: Using Datablist
        console.log(`🔍 Datablist result: ${domain || 'No domain found'}`);
        
        if (domain) {
          try {
            await cache.set(cacheKey, domain, 604800);
            console.log(`✅ Domain cached: ${domain}`);
          } catch (cacheSetError) {
            console.error(`⚠️ Cache set error:`, cacheSetError.message);
          }
        }
      } catch (domainError) {
        console.error(`❌ Datablist domain search error:`, domainError.message);
        domain = null;
      }
    } else {
      console.log(`✅ Using cached domain: ${domain}`);
    }
    
    // STEP 4: IMMEDIATE database update with domain
    if (domain) {
      console.log(`📝 STEP 4: IMMEDIATELY updating database with domain: ${domain}`);
      
      try {
        const { data: domainUpdate, error: domainUpdateError } = await supabase
          .from('leads')
          .update({
            domain: domain,
            status: 'processing', // Keep processing until CEO is found
            updated_at: new Date().toISOString()
          })
          .eq('id', leadId)
          .select();
        
        if (domainUpdateError) {
          console.error(`❌ CRITICAL: Database update failed:`, domainUpdateError);
          throw domainUpdateError;
        }
        
        console.log(`🎉 DATABASE IMMEDIATELY UPDATED with domain: ${domain}`);
        console.log(`✅ Update confirmation:`, domainUpdate);
        
        // STEP 5: Queue CEO job (still using BrightData for CEO)
        console.log(`🔄 STEP 5: Queueing CEO job...`);
        
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
            
            console.log(`🔄 CEO job data:`, ceoJobData);
            
            const ceoJob = await ceoQueue.add('find-ceo', ceoJobData, {
              delay: Math.random() * 3000
            });
            
            console.log(`✅ CEO job ${ceoJob.id} queued for ${domain}`);
          } else {
            console.error(`❌ CEO queue not available`);
          }
        } catch (ceoQueueError) {
          console.error(`❌ CEO queue error:`, ceoQueueError.message);
        }
        
        console.log(`🎉 DOMAIN WORKER COMPLETE: ${company} → ${domain}`);
        return { success: true, domain, leadId, company };
        
      } catch (dbError) {
        console.error(`❌ CRITICAL DATABASE ERROR:`, dbError);
        throw dbError;
      }
      
    } else {
      // STEP 6: Mark as failed immediately
      console.log(`📝 STEP 6: No domain found, marking as failed...`);
      
      try {
        const { data: failUpdate, error: failError } = await supabase
          .from('leads')
          .update({
            status: 'failed',
            processed_at: new Date().toISOString()
          })
          .eq('id', leadId)
          .select();
        
        if (failError) {
          console.error(`❌ Failed to mark as failed:`, failError);
        } else {
          console.log(`✅ Lead marked as failed:`, failUpdate);
        }
      } catch (failUpdateError) {
        console.error(`❌ Error in failure update:`, failUpdateError);
      }
      
      return { success: false, error: 'No domain found', leadId, company };
    }
    
  } catch (error) {
    console.error(`❌ DOMAIN WORKER CRITICAL ERROR for ${leadId}:`, error);
    console.error(`❌ Error stack:`, error.stack);
    
    // Emergency fallback - mark as failed
    try {
      await supabase
        .from('leads')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      console.log(`✅ Emergency: Lead ${leadId} marked as failed`);
    } catch (emergencyError) {
      console.error(`❌ Emergency update failed:`, emergencyError);
    }
    
    throw error;
  }
};