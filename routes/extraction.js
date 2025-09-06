const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../utils/database');
const { domainQueue, ceoQueue } = require('../utils/queue');

const router = express.Router();

// Debug route
router.get('/debug/queues', async (req, res) => {
  try {
    const domainWaiting = await domainQueue.getWaiting();
    const domainActive = await domainQueue.getActive();
    const domainCompleted = await domainQueue.getCompleted();
    const domainFailed = await domainQueue.getFailed();
    
    const ceoWaiting = await ceoQueue.getWaiting();
    const ceoActive = await ceoQueue.getActive();
    const ceoCompleted = await ceoQueue.getCompleted();
    const ceoFailed = await ceoQueue.getFailed();
    
    res.json({
      domain: {
        waiting: domainWaiting.length,
        active: domainActive.length,
        completed: domainCompleted.length,
        failed: domainFailed.length
      },
      ceo: {
        waiting: ceoWaiting.length,
        active: ceoActive.length,
        completed: ceoCompleted.length,
        failed: ceoFailed.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Queue debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear queues for debugging
router.post('/debug/clear-queues', async (req, res) => {
  try {
    console.log('🧹 Clearing all queues...');
    
    await domainQueue.empty();
    await ceoQueue.empty();
    
    await domainQueue.clean(0, 'failed');
    await ceoQueue.clean(0, 'failed');
    
    await domainQueue.clean(0, 'completed');
    await ceoQueue.clean(0, 'completed');
    
    console.log('✅ All queues cleared successfully');
    
    res.json({ 
      success: true, 
      message: 'All queues cleared successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error clearing queues:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch duplicate checking
router.post('/check-batch-duplicates', async (req, res) => {
  try {
    const { leads } = req.body;
    
    console.log(`🔍 Checking ${leads?.length || 0} leads for duplicates...`);
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.json({ duplicates: [] });
    }
    
    const checkPromises = leads.map(async (lead, index) => {
      try {
        const { data: existingLead, error } = await supabase
          .from('leads')
          .select('id')
          .eq('first_name', lead.firstName)
          .eq('last_name', lead.lastName || 'Unknown')
          .eq('company', lead.company)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          return false;
        }
        
        const isDuplicate = !!existingLead;
        if (isDuplicate) {
          console.log(`🔄 Duplicate found: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
        }
        
        return isDuplicate;
      } catch (error) {
        return false;
      }
    });
    
    const results = await Promise.all(checkPromises);
    const duplicateCount = results.filter(r => r).length;
    
    console.log(`✅ Duplicate check complete: ${duplicateCount} duplicates found out of ${leads.length}`);
    
    res.json({ duplicates: results });
    
  } catch (error) {
    console.error('❌ Batch duplicate check error:', error);
    res.status(500).json({ duplicates: [], error: error.message });
  }
});

// Extract leads with bulletproof handling
router.post('/extract', async (req, res) => {
  console.log('=== EXTRACTION REQUEST RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Leads count from extension:', req.body.leads?.length);
  console.log('File ID:', req.body.fileId);
  console.log('File name:', req.body.fileName);
  console.log('=====================================');
  
  try {
    const { leads, fileId, fileName, userId = 'anonymous' } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      console.log('❌ No valid leads provided');
      return res.status(400).json({ error: 'No leads provided' });
    }
    
    console.log(`📥 Processing ${leads.length} leads...`);
    
    let actualFileId = fileId;
    
    if (!actualFileId) {
      // Create new file
      console.log(`📁 Creating new file: ${fileName}`);
      const { data: fileData, error: fileError } = await supabase
        .from('extraction_files')
        .insert({
          name: fileName || `Extract_${Date.now()}`,
          total_leads: leads.length
        })
        .select()
        .single();
      
      if (fileError) {
        console.error('❌ File creation error:', fileError);
        throw fileError;
      }
      
      actualFileId = fileData.id;
      console.log(`✅ New file created with ID: ${actualFileId}`);
    } else {
      // Update existing file
      console.log(`📁 Using existing file ID: ${actualFileId}`);
      
      try {
        const { error: updateError } = await supabase
          .from('extraction_files')
          .update({
            updated_at: new Date().toISOString()
          })
          .eq('id', actualFileId);
        
        if (updateError) {
          console.log('⚠️ File update warning:', updateError);
        } else {
          console.log(`✅ Updated existing file timestamp`);
        }
      } catch (updateErr) {
        console.log('⚠️ File update failed, continuing anyway:', updateErr);
      }
    }
    
    const insertedLeads = [];
    let skippedCount = 0;
    let errorCount = 0;
    
    console.log(`💾 Starting insertion of ${leads.length} leads...`);
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      
      try {
        // Validate lead data
        if (!lead.firstName || !lead.company) {
          console.log(`❌ [${i + 1}] Invalid lead data - skipping`);
          skippedCount++;
          continue;
        }
        
        // Check if this exact person already exists globally
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id, file_id')
          .eq('first_name', lead.firstName)
          .eq('last_name', lead.lastName || 'Unknown')
          .eq('company', lead.company)
          .single();
        
        if (existingLead) {
          console.log(`🔄 [${i + 1}] Person already exists globally (ID: ${existingLead.id}) - skipping`);
          skippedCount++;
          continue;
        }
        
        // Create unique email
        const tempEmail = `${lead.firstName}.${lead.lastName || 'unknown'}.${Date.now()}.${i}@temp.com`;
        
        console.log(`💾 [${i + 1}/${leads.length}] Inserting: ${lead.firstName} ${lead.lastName || 'Unknown'} - ${lead.company}`);
        
        const { data: leadData, error } = await supabase
          .from('leads')
          .insert({
            first_name: lead.firstName,
            last_name: lead.lastName || 'Unknown',
            email: tempEmail,
            company: lead.company,
            title: lead.title || '',
            linkedin_url: lead.linkedinUrl || '',
            location: lead.location || '',
            file_id: actualFileId,
            file_name: fileName || `Extract_${Date.now()}`,
            status: 'pending'
          })
          .select()
          .single();
        
        if (error) {
          console.error(`❌ [${i + 1}] Database insertion error:`, error);
          errorCount++;
          continue;
        }
        
        if (leadData) {
          insertedLeads.push(leadData.id);
          console.log(`✅ [${i + 1}] Successfully inserted with ID: ${leadData.id}`);
          
          // Queue domain job
          await domainQueue.add('find-domain', {
            leadId: leadData.id,
            company: lead.company,
            userId
          }, {
            delay: Math.random() * 1000
          });
          
          console.log(`🔄 [${i + 1}] Queued domain search for: ${lead.company}`);
        }
        
      } catch (error) {
        console.error(`❌ [${i + 1}] Processing error:`, error);
        errorCount++;
      }
    }
    
    console.log('=== INSERTION SUMMARY ===');
    console.log(`✅ Successfully inserted: ${insertedLeads.length}`);
    console.log(`🔄 Skipped (duplicates): ${skippedCount}`);
    console.log(`💥 Errors: ${errorCount}`);
    console.log(`📊 Total processed: ${leads.length}`);
    console.log('==========================');
    
    // Verify final count
    const { data: verifyData } = await supabase
      .from('leads')
      .select('id')
      .eq('file_id', actualFileId);
    
    console.log(`🔍 Final verification: ${verifyData?.length || 0} leads in file ${actualFileId}`);
    
    const response = {
      success: true,
      fileId: actualFileId,
      insertedCount: insertedLeads.length,
      skippedCount: skippedCount,
      errorCount: errorCount,
      totalLeads: leads.length,
      verifiedCount: verifyData?.length || 0
    };
    
    console.log('📤 Sending response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('❌ EXTRACTION ROUTE ERROR:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: fileData } = await supabase
      .from('extraction_files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (!fileData) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const { data: leadsData } = await supabase
      .from('leads')
      .select('status, ceo_name')
      .eq('file_id', fileId);
    
    const stats = {
      ...fileData,
      current_total: leadsData.length,
      completed: leadsData.filter(l => l.status === 'completed').length,
      failed: leadsData.filter(l => l.status === 'failed').length,
      pending: leadsData.filter(l => l.status === 'pending').length,
      with_ceo: leadsData.filter(l => l.ceo_name && l.ceo_name !== '').length
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('❌ Status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;