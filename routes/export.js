const express = require('express');
const { stringify } = require('csv-stringify');
const supabase = require('../utils/database');

const router = express.Router();

router.get('/csv/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: fileData } = await supabase
      .from('extraction_files')
      .select('name')
      .eq('id', fileId)
      .single();
    
    if (!fileData) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const { data: leadsData } = await supabase
      .from('leads')
      .select('first_name, last_name, email, ceo_name, domain')
      .eq('file_id', fileId)
      .in('status', ['completed', 'failed'])
      .order('created_at', { ascending: true });
    
    if (!leadsData || leadsData.length === 0) {
      return res.status(404).json({ error: 'No processed leads found' });
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}.csv"`);
    
    const csvData = [
      ['Full Name', 'Email', 'CEO Name'],
      ...leadsData.map(row => [
        `${row.first_name} ${row.last_name}`.trim(),
        row.email || `${row.first_name}.${row.last_name}@${row.domain}`,
        row.ceo_name || 'NOT_FOUND'
      ])
    ];
    
    stringify(csvData, (err, output) => {
      if (err) {
        return res.status(500).json({ error: 'CSV generation failed' });
      }
      res.send(output);
    });
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;