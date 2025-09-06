const express = require('express');
const { supabase } = require('../utils/database');
const { stringify } = require('csv-stringify/sync');
const router = express.Router();

// Export CSV
router.get('/csv/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('file_id', fileId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found' });
    }
    
    const csv = stringify(leads, { header: true });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
    res.send(csv);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;