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
    await domainQueue.empty();
    await ceoQueue.empty();
    
    await domainQueue.clean(0, 'failed');
    await ceoQueue.clean(0, 'failed');
    
    await domainQueue.clean(0, 'completed');
    await ceoQueue.clean(0, 'completed');
    
    console.log('✅ All queues cleared');
    
    res.json({ 
      success: true, 
      message: 'All queues cleared successfully' 
    });
    
  } catch (error) {
    console.error('Error clearing queues:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch duplicate checking
router.post('/check-batch-duplicates', async (req, res) => {
  console.log('=== BATCH DUPLICATE CHECK REQUEST ===');
  console.log('Request received at:', new Date().toISOString());
  
  try {
    const { leads } = req.body;
    
    console.log(`🔍 Checking ${leads?.length || 0} leads for duplicates...`);
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      console.log('❌ No leads provided for duplicate check');
      return res.json({ duplicates: [] });
    }
    
    console.log('Sample lead for duplicate check:', leads[0]);
    
    const checkPromises = leads.map(async (lead, index) => {
      try {
        const { data: existingLead, error } = await supabase
          .from('leads')
          .select('id')
          .eq('first_name', lead.firstName)
          .eq('last_name', lead.lastName)
          .eq('company', lead.company)
          .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found (not an error)
          console.log(`⚠️ Duplicate check error for lead ${index}:`, error);
          return false;
        }
        
        const isDuplicate = !!existingLead;
        if (isDuplicate) {
          console.log(`🔄 Duplicate found: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
        }
        
        return isDuplicate;
      } catch (error) {
        console.log(`❌ Error checking duplicate for lead ${index}:`, error);
        return false;
      }
    });
    
    const results = await Promise.all(checkPromises);
    const duplicateCount = results.filter(r => r).length;
    
    console.log(`✅ Duplicate check complete: ${duplicateCount} duplicates found out of ${leads.length}`);
    console.log('=====================================');
    
    res.json({ duplicates: results });
    
  } catch (error) {
    console.error('❌ Batch duplicate check error:', error);
    res.status(500).json({ duplicates: [], error: error.message });
  }
});

// Extract leads with comprehensive logging
router.post('/extract', async (req, res) => {
  console.log('=== EXTRACTION REQUEST RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Request headers:', req.headers);
  console.log('Request body keys:', Object.keys(req.body));
  console.log('Leads count:', req.body.leads?.length);
  console.log('File ID:', req.body.fileId);
  console.log('File name:', req.body.fileName);
  console.log('User ID:', req.body.userId);
  
  if (req.body.leads?.length > 0) {
    console.log('Sample lead:', req.body.leads[0]);
  }
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
      console.log('📁 Creating new file...');
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
      console.log(`✅ File created with ID: ${actualFileId}`);
    } else {
      console.log(`📁 Using existing file ID: ${actualFileId}`);
    }
    
    const insertedLeads = [];
    let skippedCount = 0;
    
    console.log('💾 Starting lead insertion...');
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      
      try {
        const tempEmail = `${lead.firstName}.${lead.lastName}.${Date.now()}.${i}@temp.com`;
        
        console.log(`💾 [${i + 1}/${leads.length}] Inserting: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
        
        const { data: leadData, error } = await supabase
          .from('leads')
          .insert({
            first_name: lead.firstName || '',
            last_name: lead.lastName || '',
            email: tempEmail,
            company: lead.company || '',
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
          console.log(`❌ [${i + 1}] Insert error:`, error);
          skippedCount++;
          continue;
        }
        
        if (leadData) {
          insertedLeads.push(leadData.id);
          console.log(`✅ [${i + 1}] Inserted with ID: ${leadData.id}`);
          
          // Queue domain job
          try {
            await domainQueue.add('find-domain', {
              leadId: leadData.id,
              company: lead.company,
              userId
            }, {
              delay: Math.random() * 1000
            });
            
            console.log(`🔄 [${i + 1}] Queued domain search for: ${lead.company}`);
          } catch (queueError) {
            console.error(`❌ [${i + 1}] Queue error:`, queueError);
          }
        }
      } catch (error) {
        console.error(`❌ [${i + 1}] Processing error:`, error);
        skippedCount++;
      }
    }
    
    console.log('=== EXTRACTION SUMMARY ===');
    console.log(`✅ Successfully inserted: ${insertedLeads.length}`);
    console.log(`❌ Skipped/Failed: ${skippedCount}`);
    console.log(`📊 Total processed: ${leads.length}`);
    console.log('==========================');
    
    // Verify insertion by counting
    const { data: verifyData, error: verifyError } = await supabase
      .from('leads')
      .select('id')
      .eq('file_id', actualFileId);
    
    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
    } else {
      console.log(`🔍 Verification: ${verifyData.length} leads found in database for file ${actualFileId}`);
    }
    
    const response = {
      success: true,
      fileId: actualFileId,
      insertedCount: insertedLeads.length,
      skippedCount: skippedCount,
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
    
    console.log(`📊 Status request for file: ${fileId}`);
    
    const { data: fileData, error: fileError } = await supabase
      .from('extraction_files')
      .select('*')
      .eq('id', fileId)
      .single();
    
    if (fileError || !fileData) {
      console.log(`❌ File not found: ${fileId}`);
      return res.status(404).json({ error: 'File not found' });
    }
    
    const { data: leadsData, error: leadsError } = await supabase
      .from('leads')
      .select('status, ceo_name')
      .eq('file_id', fileId);
    
    if (leadsError) {
      console.error('❌ Error fetching leads:', leadsError);
      throw leadsError;
    }
    
    const stats = {
      ...fileData,
      current_total: leadsData.length,
      completed: leadsData.filter(l => l.status === 'completed').length,
      failed: leadsData.filter(l => l.status === 'failed').length,
      pending: leadsData.filter(l => l.status === 'pending').length,
      with_ceo: leadsData.filter(l => l.ceo_name && l.ceo_name !== '').length
    };
    
    console.log(`📊 Status for file ${fileId}:`, stats);
    
    res.json(stats);
    
  } catch (error) {
    console.error('❌ Status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;