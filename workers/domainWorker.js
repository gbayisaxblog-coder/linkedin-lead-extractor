const { createClient } = require('@supabase/supabase-js');
const DatablistService = require('../services/datablist'); // Import the class
const cache = require('../services/cache');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Create an instance of the service
const datablistService = new DatablistService();

module.exports = async function(job) {
  const { leadId, company, fullName, userId } = job.data;
  
  console.log(`🌐 Domain worker started for lead ${leadId}: ${company}`);
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
    
    // STEP 3: Find domain if not cached - Using Datablist
    if (!domain) {
      console.log(`🔍 STEP 3: Using Datablist to find domain for: ${company}`);
      
      try {
        // FIXED: Use the correct method with proper instantiation
        domain = await datablistService.findDomain(company);
        console.log(`🔍 Datablist result: ${domain || 'No domain found'}`);
        
        if (domain) {
          try {
            await cache.set(cacheKey, domain, 604800); // Cache for 7 days
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
            status: 'domain_found',
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
        
        // STEP 5: Queue EMAIL job
        console.log(`🔄 STEP 5: Queueing EMAIL job...`);
        
        try {
          const queueModule = require('../utils/queue');
          const emailQueue = queueModule.getEmailQueue ? queueModule.getEmailQueue() : queueModule.emailQueue;
          
          if (emailQueue) {
            const emailJobData = {
              leadId,
              fullName,
              domain,
              userId: userId || 'system'
            };
            
            console.log(`🔄 Email job data:`, emailJobData);
            
            const emailJob = await emailQueue.add('find-email', emailJobData, {
              delay: Math.random() * 3000
            });
            
            console.log(`✅ Email job ${emailJob.id} queued for ${fullName} at ${domain}`);
          } else {
            console.error(`❌ Email queue not available`);
          }
        } catch (emailQueueError) {
          console.error(`❌ Email queue error:`, emailQueueError.message);
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
            updated_at: new Date().toISOString()
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
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      console.log(`✅ Emergency: Lead ${leadId} marked as failed`);
    } catch (emergencyError) {
      console.error(`❌ Emergency update failed:`, emergencyError);
    }
    
    throw error;
  }
};