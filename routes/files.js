const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// Get files
router.get('/', async (req, res) => {
  try {
    const { data: files, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create file
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }
    
    const { data: file, error } = await supabase
      .from('files')
      .insert([{ name }])
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;