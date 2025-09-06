const supabase = require('../utils/database');
const { ceoQueue } = require('../utils/queue');

module.exports = async function(job) {
  const { leadId, company, userId } = job.data;
  
  console.log(`🌐 Domain worker started for lead ${leadId}: ${company}`);
  
  try {
    // TEST: Generate simple domain from company name
    const simpleDomain = `${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
    
    console.log(`✅ Generated test domain for ${company}: ${simpleDomain}`);
    
    // Update lead with domain
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        domain: simpleDomain,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (updateError) {
      throw updateError;
    }
    
    // Queue CEO finding job
    await ceoQueue.add('find-ceo', {
      leadId,
      domain: simpleDomain,
      company,
      userId,
      retryCount: 0
    }, {
      delay: Math.random() * 1000
    });
    
    console.log(`✅ Queued CEO job for lead ${leadId}`);
    
    return { success: true, domain: simpleDomain };
    
  } catch (error) {
    console.error(`❌ Domain worker error for lead ${leadId}:`, error);
    throw error;
  }
};