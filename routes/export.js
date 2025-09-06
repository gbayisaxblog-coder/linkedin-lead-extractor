const express = require('express');
const { supabase } = require('../utils/database');
const { stringify } = require('csv-stringify/sync');
const router = express.Router();

// Export leads to CSV
router.get('/csv/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log('📥 Exporting CSV for file:', fileId);
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('file_id', fileId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ CSV export error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found for this file' });
    }
    
    // Generate CSV
    const csv = stringify(leads, {
      header: true,
      columns: [
        'id',
        'full_name',
        'company',
        'title',
        'location',
        'linkedin_url',
        'domain',
        'email',
        'email_verified',
        'ceo_name',
        'status',
        'created_at'
      ]
    });
    
    console.log(`✅ CSV generated: ${leads.length} leads`);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${fileId}_${Date.now()}.csv"`);
    res.send(csv);
    
  } catch (error) {
    console.error('❌ CSV export route error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;