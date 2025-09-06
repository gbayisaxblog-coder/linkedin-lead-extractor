const express = require('express');
const { supabase } = require('../utils/database');
const { domainQueue } = require('../utils/queue');
const router = express.Router();

// Bulletproof extract route
router.post('/extract', async (req, res) => {
  const startTime = Date.now();
  console.log('🚀 EXTRACTION REQUEST RECEIVED');
  console.log('📅 Timestamp:', new Date().toISOString());
  
  try {
    const { leads, fileId, fileName, userId } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      console.log('❌ Invalid leads data');
      return res.status(400).json({ error: 'Valid leads array is required' });
    }
    
    if (!fileId) {
      console.log('❌ Missing file ID');
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    console.log(`📊 Processing ${leads.length} leads for file: ${fileName}`);
    console.log(`📁 File ID: ${fileId}`);
    
    // Count existing leads before insertion
    const { count: initialCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Initial database count: ${initialCount}`);
    
    // Prepare bulletproof lead data
    const cleanLeads = leads.map(lead => {
      // Clean and validate data
      const fullName = String(lead.fullName || lead.full_name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim())
        .replace(/[^\w\s\-'\.]/g, ' ') // Replace special chars with spaces
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim()
        .substring(0, 200); // Limit length
      
      const company = String(lead.company || '')
        .replace(/[^\w\s\-&'\.]/g, ' ') // Allow business chars
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim()
        .substring(0, 200); // Limit length
      
      if (!fullName || !company) {
        console.log(`⚠️ Skipping invalid lead: name="${fullName}", company="${company}"`);
        return null;
      }
      
      return {
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
    }).filter(Boolean); // Remove null entries
    
    console.log(`✅ Cleaned leads: ${cleanLeads.length}/${leads.length} valid`);
    
    if (cleanLeads.length === 0) {
      console.log('❌ No valid leads to insert');
      return res.json({
        success: true,
        insertedCount: 0,
        skippedCount: leads.length,
        errorCount: 0,
        message: 'No valid leads found'
      });
    }
    
    // Bulletproof insertion with upsert
    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    console.log('💾 Starting bulletproof insertion...');
    
    for (let i = 0; i < cleanLeads.length; i++) {
      const lead = cleanLeads[i];
      
      try {
        console.log(`💾 [${i + 1}/${cleanLeads.length}] Processing: ${lead.full_name} - ${lead.company}`);
        
        const { data, error } = await supabase
          .from('leads')
          .upsert(lead, {
            onConflict: 'full_name,company',
            ignoreDuplicates: false
          })
          .select();
        
        if (error) {
          console.error(`❌ [${i + 1}] Insert error:`, error.message);
          errorCount++;
        } else if (data && data.length > 0) {
          console.log(`✅ [${i + 1}] Success: ID ${data[0].id}`);
          insertedCount++;
          
          // Queue domain search for new leads
          try {
            await domainQueue.add('findDomain', {
              leadId: data[0].id,
              company: lead.company
            });
            console.log(`🔄 [${i + 1}] Queued domain search`);
          } catch (queueError) {
            console.error(`❌ [${i + 1}] Queue error:`, queueError.message);
          }
        } else {
          console.log(`🔄 [${i + 1}] Duplicate skipped`);
          skippedCount++;
        }
        
      } catch (insertError) {
        console.error(`❌ [${i + 1}] Exception:`, insertError.message);
        errorCount++;
      }
    }
    
    // Final verification
    const { count: finalCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    
    const actualInserted = finalCount - initialCount;
    
    console.log('📊 INSERTION SUMMARY:');
    console.log(`✅ Inserted: ${insertedCount}`);
    console.log(`🔄 Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`🔍 Database change: ${actualInserted}`);
    console.log(`⏱️ Duration: ${Date.now() - startTime}ms`);
    
    res.json({
      success: true,
      insertedCount: actualInserted,
      skippedCount,
      errorCount,
      totalProcessed: cleanLeads.length,
      duration: Date.now() - startTime
    });
    
  } catch (error) {
    console.error('❌ Extraction route error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
  }
});

// Get file stats
router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: stats, error } = await supabase
      .from('leads')
      .select('status')
      .eq('file_id', fileId);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    const summary = {
      current_total: stats.length,
      pending: stats.filter(s => s.status === 'pending').length,
      processing: stats.filter(s => s.status === 'processing').length,
      completed: stats.filter(s => s.status === 'completed').length,
      failed: stats.filter(s => s.status === 'failed').length,
      with_ceo: stats.filter(s => s.status === 'completed').length // Simplified for now
    };
    
    res.json(summary);
    
  } catch (error) {
    console.error('❌ Status route error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;