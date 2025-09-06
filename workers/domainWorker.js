const BrightDataService = require('../services/brightdata');
const cache = require('../services/cache');
const supabase = require('../utils/database');
const { ceoQueue } = require('../utils/queue');

const brightData = new BrightDataService();

module.exports = async function(job) {
  const { leadId, company, userId } = job.data;
  
  try {
    const cacheKey = `domain:${company.toLowerCase()}`;
    let domain = await cache.get(cacheKey);
    
    if (!domain) {
      domain = await brightData.findDomain(company);
      
      if (domain) {
        await cache.set(cacheKey, domain, 604800); // Cache for 7 days
      }
    }
    
    if (domain) {
      await supabase
        .from('leads')
        .update({
          domain: domain,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
      
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
      
      return { success: true, domain };
    } else {
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
    console.error('Domain worker error:', error);
    return { success: false, error: error.message };
  }
};