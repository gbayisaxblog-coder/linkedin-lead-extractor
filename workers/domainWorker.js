const BrightDataService = require('../services/brightdata');
const cache = require('../services/cache');
const supabase = require('../utils/database');
const { ceoQueue } = require('../utils/queue');

const brightData = new BrightDataService();

module.exports = async function(job) {
  const { leadId, company, userId } = job.data;
  
  console.log(`🌐 REAL Domain worker started for lead ${leadId}: ${company}`);
  
  try {
    const cacheKey = `domain:${company.toLowerCase()}`;
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
      await ceoQueue.add('find-ceo', {
        leadId,
        domain,
        company,
        userId,
        retryCount: 0
      }, {
        delay: Math.random() * 2000
      });
      
      console.log(`✅ Queued CEO job for lead ${leadId}: ${domain}`);
      
      return { success: true, domain };
    } else {
      // Mark as failed if no domain found
      await supabase
        .from('leads')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
      return { success: false, error: 'Domain not found' };
    }
    
  } catch (error) {
    console.error(`❌ Domain worker error for lead ${leadId}:`, error);
    throw error;
  }
};