const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// Simple extract route - just save fullname + company
router.post('/extract', async (req, res) => {
  console.log('=== SIMPLE EXTRACTION REQUEST ===');
  
  try {
    const { leads, fileId, fileName } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Invalid leads' });
    }
    
    console.log(`📊 Processing ${leads.length} leads`);
    
    let insertedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      
      const fullName = String(lead.fullName || '')
        .trim()
        .substring(0, 200);
      
      const company = String(lead.company || '')
        .trim()
        .substring(0, 200);
      
      if (!fullName || !company || fullName.length < 2 || company.length < 2) {
        console.log(`❌ [${i + 1}] Invalid: "${fullName}" - "${company}"`);
        skippedCount++;
        continue;
      }
      
      try {
        console.log(`💾 [${i + 1}] Inserting: "${fullName}" - "${company}"`);
        
        const { data, error } = await supabase
          .from('leads')
          .insert([{
            full_name: fullName,
            company: company,
            file_id: fileId
          }])
          .select();
        
        if (error) {
          if (error.code === '23505') {
            console.log(`🔄 [${i + 1}] Duplicate: "${fullName}" - "${company}"`);
            skippedCount++;
          } else {
            console.error(`❌ [${i + 1}] Error:`, error.message);
            skippedCount++;
          }
        } else if (data && data.length > 0) {
          console.log(`✅ [${i + 1}] Success: ID ${data[0].id}`);
          insertedCount++;
        } else {
          skippedCount++;
        }
        
      } catch (insertError) {
        console.error(`❌ [${i + 1}] Exception:`, insertError.message);
        skippedCount++;
      }
    }
    
    // Update file statistics
    if (insertedCount > 0) {
      const { data: fileData } = await supabase
        .from('files')
        .select('total_leads')
        .eq('id', fileId)
        .single();
      
      const newTotal = (fileData?.total_leads || 0) + insertedCount;
      
      await supabase
        .from('files')
        .update({ total_leads: newTotal })
        .eq('id', fileId);
    }
    
    console.log('=== SUMMARY ===');
    console.log(`✅ Inserted: ${insertedCount}`);
    console.log(`🔄 Skipped: ${skippedCount}`);
    console.log('===============');
    
    res.json({
      success: true,
      insertedCount: insertedCount,
      skippedCount: skippedCount,
      totalProcessed: leads.length
    });
    
  } catch (error) {
    console.error('❌ Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check duplicates
router.post('/check-duplicates', async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Invalid leads data' });
    }
    
    const duplicateResults = [];
    
    for (const lead of leads) {
      const fullName = String(lead.fullName || '').trim();
      const company = String(lead.company || '').trim();
      
      if (!fullName || !company) {
        duplicateResults.push(false);
        continue;
      }
      
      const { data: existingLead, error } = await supabase
        .from('leads')
        .select('id')
        .eq('full_name', fullName)
        .eq('company', company)
        .limit(1);
      
      if (error) {
        duplicateResults.push(false);
      } else {
        duplicateResults.push(existingLead && existingLead.length > 0);
      }
    }
    
    res.json({ duplicates: duplicateResults });
    
  } catch (error) {
    console.error('❌ Duplicate check error:', error);
    res.json({ duplicates: req.body.leads?.map(() => false) || [] });
  }
});

// Simple stats
router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id')
      .eq('file_id', fileId);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({
      current_total: leads.length,
      completed: leads.length,
      with_ceo: leads.length, // For UI compatibility
      pending: 0,
      processing: 0,
      failed: 0
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;