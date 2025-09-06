const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// Get all files
router.get('/', async (req, res) => {
  try {
    console.log('📂 Loading files...');
    
    const { data: files, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Files query error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log(`✅ Loaded ${files.length} files`);
    res.json(files);
    
  } catch (error) {
    console.error('❌ Files route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new file
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'File name is required' });
    }
    
    console.log('📁 Creating file:', name);
    
    const { data: newFile, error } = await supabase
      .from('files')
      .insert([{ name }])
      .select()
      .single();
    
    if (error) {
      console.error('❌ File creation error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('✅ File created:', newFile);
    res.json(newFile);
    
  } catch (error) {
    console.error('❌ File creation route error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;