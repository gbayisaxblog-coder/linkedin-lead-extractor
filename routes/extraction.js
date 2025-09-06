const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// Bulletproof extract route with duplicate debugging
router.post('/extract', async (req, res) => {
  const startTime = Date.now();
  console.log('=== EXTRACTION REQUEST RECEIVED ===');
  console.log('📅 Timestamp:', new Date().toISOString());
  
  try {
    const { leads, fileId, fileName, userId } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      console.log('❌ Invalid leads data');
      return res.status(400).json({ error: 'Valid leads array is required' });
    }
    
    console.log(`📊 Leads from extension: ${leads.length}`);
    console.log(`📁 File ID: ${fileId}`);
    console.log(`📁 File name: ${fileName}`);
    console.log('=====================================');
    
    // Count existing leads
    const { count: initialCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Initial leads in database: ${initialCount}`);
    
    // Show sample of incoming data
    console.log('📋 Sample incoming lead:', leads[0]);
    
    // Prepare bulletproof lead data
    const cleanLeads = leads.map((lead, index) => {
      console.log(`🔍 [${index + 1}] Raw lead:`, {
        fullName: lead.fullName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company
      });
      
      // Extract full name with multiple fallbacks
      let fullName = '';
      if (lead.fullName && lead.fullName.trim()) {
        fullName = String(lead.fullName).trim();
      } else if (lead.firstName || lead.lastName) {
        fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
      } else if (lead.full_name) {
        fullName = String(lead.full_name).trim();
      }
      
      // Clean full name
      fullName = fullName
        .replace(/[^\w\s\-'\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
      
      // Extract and clean company
      const company = String(lead.company || '')
        .replace(/[^\w\s\-&'\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
      
      console.log(`🔍 [${index + 1}] Cleaned lead: name="${fullName}", company="${company}"`);
      
      if (!fullName || !company || fullName.length < 2 || company.length < 2) {
        console.log(`❌ [${index + 1}] INVALID after cleaning: name="${fullName}" (${fullName.length}), company="${company}" (${company.length})`);
        return null;
      }
      
      const cleanLead = {
        full_name: fullName,
        company: company,
        title: String(lead.title || '').substring(0, 200) || null,
        location: String(lead.location || '').substring(0, 100) || null,
        linkedin_url: String(lead.linkedinUrl || lead.linkedin_url || '').substring(0, 500) || null,
        file_id: fileId,
        file_name: fileName,
        status: 'pending',
        extracted_at: lead.extractedAt || new Date().toISOString()
      };
      
      console.log(`✅ [${index + 1}] Final clean lead:`, cleanLead);
      return cleanLead;
    }).filter(Boolean);
    
    console.log(`✅ Valid leads after cleaning: ${cleanLeads.length}/${leads.length}`);
    
    if (cleanLeads.length === 0) {
      console.log('❌ No valid leads after cleaning');
      return res.json({
        success: true,
        insertedCount: 0,
        skippedCount: leads.length,
        errorCount: 0,
        message: 'No valid leads found after cleaning'
      });
    }
    
    console.log('💾 Starting insertion of', cleanLeads.length, 'leads...');
    
    // Check for existing duplicates BEFORE insertion
    console.log('🔍 Checking for existing duplicates...');
    for (let i = 0; i < cleanLeads.length; i++) {
      const lead = cleanLeads[i];
      
      const { data: existing, error: checkError } = await supabase
        .from('leads')
        .select('id, full_name, company')
        .eq('full_name', lead.full_name)
        .eq('company', lead.company)
        .limit(1);
      
      if (checkError) {
        console.error(`❌ [${i + 1}] Duplicate check error:`, checkError);
      } else if (existing && existing.length > 0) {
        console.log(`🔄 [${i + 1}] DUPLICATE FOUND: "${lead.full_name}" - "${lead.company}" (ID: ${existing[0].id})`);
      } else {
        console.log(`✅ [${i + 1}] NEW LEAD: "${lead.full_name}" - "${lead.company}"`);
      }
    }
    
    // Bulletproof insertion one by one
    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < cleanLeads.length; i++) {
      const lead = cleanLeads[i];
      
      try {
        console.log(`💾 [${i + 1}/${cleanLeads.length}] Attempting insert: "${lead.full_name}" - "${lead.company}"`);
        
        // Try direct INSERT first (not upsert) to see exact error
        const { data, error } = await supabase
          .from('leads')
          .insert([lead])
          .select();
        
        if (error) {
          if (error.code === '23505') { // Unique constraint violation
            console.log(`🔄 [${i + 1}] Duplicate detected by constraint: ${error.message}`);
            skippedCount++;
          } else {
            console.error(`❌ [${i + 1}] Insert error:`, error);
            errorCount++;
          }
        } else if (data && data.length > 0) {
          console.log(`✅ [${i + 1}] Successfully inserted with ID: ${data[0].id}`);
          insertedCount++;
        } else {
          console.log(`🔄 [${i + 1}] No data returned (possible duplicate)`);
          skippedCount++;
        }
        
      } catch (insertError) {
        console.error(`❌ [${i + 1}] Exception during insert:`, insertError);
        errorCount++;
      }
    }
    
    console.log('=== INSERTION SUMMARY ===');
    console.log(`✅ Inserted: ${insertedCount}`);
    console.log(`🔄 Skipped: ${skippedCount}`);
    console.log(`💥 Errors: ${errorCount}`);
    console.log('==========================');
    
    // Return response
    const response = {
      success: true,
      insertedCount: insertedCount,
      skippedCount: skippedCount,
      errorCount: errorCount,
      totalProcessed: cleanLeads.length,
      duration: Date.now() - startTime
    };
    
    console.log('📤 Response summary:', response);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Extraction route error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      insertedCount: 0,
      duration: Date.now() - startTime
    });
  }
});

// Get file stats (updated for new schema)
router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log('📊 Getting stats for file:', fileId);
    
    const { data: stats, error } = await supabase
      .from('leads')
      .select('status, ceo_name')
      .eq('file_id', fileId);
    
    if (error) {
      console.error('❌ Stats query error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    const summary = {
      current_total: stats.length,
      pending: stats.filter(s => s.status === 'pending').length,
      processing: stats.filter(s => s.status === 'processing').length,
      completed: stats.filter(s => s.status === 'completed').length,
      failed: stats.filter(s => s.status === 'failed').length,
      with_ceo: stats.filter(s => s.ceo_name && s.ceo_name.trim()).length
    };
    
    console.log('📊 Stats summary:', summary);
    res.json(summary);
    
  } catch (error) {
    console.error('❌ Status route error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;