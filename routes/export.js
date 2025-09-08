const express = require('express');
const { supabase } = require('../utils/database');
const { stringify } = require('csv-stringify');

const router = express.Router();

// Export simple CSV
router.get('/csv/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`📥 CSV export requested for file: ${fileId}`);
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('full_name, company, created_at')
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
    
    // Simple CSV data
    const csvData = leads.map(lead => ({
      'Full Name': lead.full_name || '',
      'Company': lead.company || '',
      'Domain': '', // Empty for Datablist to fill
      'Email': '', // Empty for Google Sheets to fill
      'Email Pattern': '', // Empty for Google Sheets to fill
      'CEO Name': '', // Empty for Google Sheets to fill
      'Created At': lead.created_at ? new Date(lead.created_at).toISOString() : ''
    }));
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="linkedin_leads_${fileId}.csv"`);
    
    stringify(csvData, {
      header: true,
      columns: ['Full Name', 'Company', 'Domain', 'Email', 'Email Pattern', 'CEO Name', 'Created At']
    }).pipe(res);
    
    console.log('✅ CSV export completed');
    
  } catch (error) {
    console.error('❌ CSV export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;