const supabase = require('../utils/database');

module.exports = async function(job) {
  const { leadId, firstName, lastName, company, userId } = job.data;
  
  try {
    // Get the lead to check if domain was found
    const { data: leadData } = await supabase
      .from('leads')
      .select('domain')
      .eq('id', leadId)
      .single();
    
    const domain = leadData?.domain;
    
    if (!domain) {
      return { success: false, error: 'No domain available for email generation' };
    }
    
    // Generate simple email pattern (we'll add SMTP validation later)
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    
    // Update lead with generated email
    await supabase
      .from('leads')
      .update({
        email: email,
        email_verified: false,
        email_pattern: 'first.last',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
    
    return { success: true, email, verified: false };
    
  } catch (error) {
    console.error('Email worker error:', error);
    return { success: false, error: error.message };
  }
};