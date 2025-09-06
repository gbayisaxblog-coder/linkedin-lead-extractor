const supabase = require('../utils/database');

module.exports = async function(job) {
  const { leadId, domain, company, userId, retryCount = 0 } = job.data;
  
  console.log(`👔 CEO worker started for lead ${leadId}: ${company} (${domain})`);
  
  try {
    // TEST: Generate simple CEO name
    const testCeoName = `Test CEO of ${company}`;
    
    console.log(`✅ Generated test CEO for ${company}: ${testCeoName}`);
    
    // Update the lead
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        ceo_name: testCeoName,
        status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    if (updateError) {
      throw updateError;
    }
    
    console.log(`✅ Lead ${leadId} completed successfully`);
    return { success: true, ceo: testCeoName };
    
  } catch (error) {
    console.error(`❌ CEO worker error for lead ${leadId}:`, error);
    
    try {
      await supabase
        .from('leads')
        .update({
          status: 'failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', leadId);
    } catch (e) {
      console.error('Failed to update lead status:', e);
    }
    
    throw error;
  }
};