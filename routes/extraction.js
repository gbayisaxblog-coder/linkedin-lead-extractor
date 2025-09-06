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
    
    console.log('✅ All queues cleared');
    
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
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.json({ duplicates: [] });
    }
    
    const checkPromises = leads.map(async (lead) => {
      try {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('first_name', lead.firstName)
          .eq('last_name', lead.lastName || 'Unknown')
          .eq('company', lead.company)
          .single();
        
        return !!existingLead;
      } catch (error) {
        return false;
      }
    });
    
    const results = await Promise.all(checkPromises);
    const duplicateCount = results.filter(r => r).length;
    
    console.log(`✅ Duplicate check: ${duplicateCount}/${leads.length} duplicates found`);
    res.json({ duplicates: results });
    
  } catch (error) {
    console.error('❌ Duplicate check error:', error);
    res.status(500).json({ duplicates: [], error: error.message });
  }
});

// BULLETPROOF extraction with comprehensive verification
router.post('/extract', async (req, res) => {
  console.log('=== EXTRACTION REQUEST RECEIVED ===');
  console.log('Leads from extension:', req.body.leads?.length);
  console.log('File ID:', req.body.fileId);
  console.log('File name:', req.body.fileName);
  console.log('=====================================');
  
  try {
    const { leads, fileId, fileName, userId = 'anonymous' } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ 
        error: 'No leads provided',
        details: 'Leads array is empty or invalid'
      });
    }
    
    // Get initial database count for verification
    const { data: initialLeadsData } = await supabase
      .from('leads')
      .select('id')
      .eq('file_id', fileId);
    
    const initialCount = initialLeadsData?.length || 0;
    console.log(`📊 Initial leads in database: ${initialCount}`);
    
    let actualFileId = fileId;
    
    if (!actualFileId) {
      // Create new file
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
        throw new Error(`File creation failed: ${fileError.message}`);
      }
      
      actualFileId = fileData.id;
      console.log(`✅ New file created: ${actualFileId}`);
    }
    
    const insertedLeads = [];
    let skippedCount = 0;
    let errorCount = 0;
    const insertionErrors = [];
    
    console.log(`💾 Starting insertion of ${leads.length} leads...`);
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      
      try {
        // Validate required data
        if (!lead.firstName || !lead.company) {
          skippedCount++;
          continue;
        }
        
        // Check for global duplicate
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('first_name', lead.firstName)
          .eq('last_name', lead.lastName || 'Unknown')
          .eq('company', lead.company)
          .single();
        
        if (existingLead) {
          skippedCount++;
          continue;
        }
        
        // Insert lead
        const tempEmail = `${lead.firstName}.${lead.lastName || 'unknown'}.${Date.now()}.${i}@temp.com`;
        
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
          console.error(`❌ Insert error [${i + 1}]:`, error.message);
          insertionErrors.push({
            lead: `${lead.firstName} ${lead.lastName} - ${lead.company}`,
            error: error.message
          });
          errorCount++;
          continue;
        }
        
        if (leadData) {
          insertedLeads.push(leadData.id);
          
          // Queue domain job
          try {
            await domainQueue.add('find-domain', {
              leadId: leadData.id,
              company: lead.company,
              userId
            }, {
              delay: Math.random() * 1000
            });
          } catch (queueError) {
            console.error(`❌ Queue error for ${leadData.id}:`, queueError.message);
          }
        }
        
      } catch (error) {
        console.error(`❌ Processing error [${i + 1}]:`, error.message);
        insertionErrors.push({
          lead: `${lead.firstName || 'unknown'} ${lead.lastName || 'unknown'} - ${lead.company || 'unknown'}`,
          error: error.message
        });
        errorCount++;
      }
    }
    
    console.log('=== INSERTION SUMMARY ===');
    console.log(`✅ Inserted: ${insertedLeads.length}`);
    console.log(`🔄 Skipped: ${skippedCount}`);
    console.log(`💥 Errors: ${errorCount}`);
    console.log('==========================');
    
    // CRITICAL: Verify database count
    const { data: finalLeadsData } = await supabase
      .from('leads')
      .select('id')
      .eq('file_id', actualFileId);
    
    const finalCount = finalLeadsData?.length || 0;
    const actualInserted = finalCount - initialCount;
    
    console.log(`🔍 VERIFICATION: Expected ${insertedLeads.length}, Found ${actualInserted} new leads`);
    
    if (actualInserted !== insertedLeads.length) {
      console.error(`❌ VERIFICATION FAILED: Count mismatch!`);
      console.log(`   Backend reported: ${insertedLeads.length} inserted`);
      console.log(`   Database shows: ${actualInserted} new leads`);
      console.log(`   Missing: ${insertedLeads.length - actualInserted} leads`);
    } else {
      console.log(`✅ VERIFICATION SUCCESSFUL: All leads confirmed in database`);
    }
    
    const response = {
      success: true,
      fileId: actualFileId,
      insertedCount: insertedLeads.length,
      skippedCount: skippedCount,
      errorCount: errorCount,
      totalLeads: leads.length,
      verifiedCount: finalCount,
      actualInserted: actualInserted,
      verificationPassed: actualInserted === insertedLeads.length,
      insertionErrors: insertionErrors.length > 0 ? insertionErrors.slice(0, 5) : undefined // Limit error details
    };
    
    console.log('📤 Response summary:', {
      inserted: response.insertedCount,
      verified: response.actualInserted,
      passed: response.verificationPassed
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ EXTRACTION ERROR:', error.message);
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