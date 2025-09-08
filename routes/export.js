const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { stringify } = require('csv-stringify');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Export leads as CSV
router.get('/csv/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`📥 CSV export requested for file: ${fileId}`);
    
    // Get leads from database
    const { data: leads, error } = await supabase
      .from('leads')
      .select('full_name, company, domain, email, email_pattern, status, created_at')
      .eq('file_id', fileId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('❌ Database query error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }
    
    if (!leads || leads.length === 0) {
      return res.status(404).json({ error: 'No leads found for this file' });
    }
    
    console.log(`📊 Exporting ${leads.length} leads`);
    
    // Prepare CSV data
    const csvData = leads.map(lead => ({
      'Full Name': lead.full_name || '',
      'Company': lead.company || '',
      'Domain': lead.domain || '',
      'Email': lead.email || '',
      'Email Pattern': lead.email_pattern || '',
      'Status': lead.status || '',
      'Created At': lead.created_at ? new Date(lead.created_at).toISOString() : ''
    }));
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="linkedin_leads_${fileId}.csv"`);
    
    // Convert to CSV and send
    stringify(csvData, {
      header: true,
      columns: ['Full Name', 'Company', 'Domain', 'Email', 'Email Pattern', 'Status', 'Created At']
    }).pipe(res);
    
    console.log('✅ CSV export completed');
    
  } catch (error) {
    console.error('❌ CSV export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;