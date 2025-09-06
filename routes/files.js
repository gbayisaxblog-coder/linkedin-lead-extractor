const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../utils/database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data: files } = await supabase
      .from('extraction_files')
      .select('*')
      .order('created_at', { ascending: false });
    
    res.json(files || []);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'File name required' });
    }
    
    const { data: fileData } = await supabase
      .from('extraction_files')
      .insert({ name: name })
      .select()
      .single();
    
    res.json(fileData);
  } catch (error) {
    console.error('Create file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;