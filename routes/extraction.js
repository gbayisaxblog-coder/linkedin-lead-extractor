// routes/extraction.js - COMPLETE FIXED VERSION
const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// Import queues (will be initialized by server.js)
let domainQueue;
try {
  const queueModule = require('../utils/queue');
  domainQueue = queueModule.domainQueue;
} catch (error) {
  console.log('⚠️ Queue not yet initialized, will retry after server startup');
}

// Bulletproof extract route
router.post('/extract', async (req, res) => {
  console.log('=== EXTRACTION REQUEST ===');
  
  try {
    const { leads, fileId, fileName } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Invalid leads' });
    }
    
    console.log(`📊 Processing ${leads.length} leads`);
    
    let insertedCount = 0;
    let skippedCount = 0;
    const insertedLeads = []; // Track inserted leads for queueing
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      
      // Clean data
      const fullName = String(lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`)
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
            title: String(lead.title || '').substring(0, 200) || null,
            location: String(lead.location || '').substring(0, 100) || null,
            linkedin_url: String(lead.linkedinUrl || '').substring(0, 500) || null,
            file_id: fileId,
            file_name: fileName,
            status: 'pending'
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
          insertedLeads.push({
            id: data[0].id,
            fullName,
            company
          });
        } else {
          console.log(`🔄 [${i + 1}] No data returned`);
          skippedCount++;
        }
        
      } catch (insertError) {
        console.error(`❌ [${i + 1}] Exception:`, insertError.message);
        skippedCount++;
      }
    }
    
    // Queue domain finding jobs for inserted leads
    if (insertedLeads.length > 0) {
      try {
        // Get queue reference if not available
        if (!domainQueue) {
          const queueModule = require('../utils/queue');
          domainQueue = queueModule.domainQueue;
        }
        
        if (domainQueue) {
          console.log(`🚀 Queueing ${insertedLeads.length} domain finding jobs...`);
          
          for (const lead of insertedLeads) {
            try {
              await domainQueue.add('find-domain', {
                leadId: lead.id,
                company: lead.company,
                userId: 'system'
              }, {
                delay: Math.random() * 5000 // Random delay 0-5 seconds
              });
              
              console.log(`🎯 Queued domain job for lead ${lead.id}: ${lead.company}`);
            } catch (queueError) {
              console.error(`❌ Failed to queue domain job for lead ${lead.id}:`, queueError.message);
            }
          }
        } else {
          console.log('⚠️ Domain queue not available, leads will need manual processing');
        }
      } catch (queueError) {
        console.error('❌ Queue error:', queueError.message);
      }
    }
    
    console.log('=== SUMMARY ===');
    console.log(`✅ Inserted: ${insertedCount}`);
    console.log(`🔄 Skipped: ${skippedCount}`);
    console.log(`🚀 Queued: ${insertedLeads.length} domain jobs`);
    console.log('===============');
    
    res.json({
      success: true,
      insertedCount: insertedCount,
      skippedCount: skippedCount,
      totalProcessed: leads.length,
      queuedJobs: insertedLeads.length
    });
    
  } catch (error) {
    console.error('❌ Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get stats
router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('status, ceo_name')
      .eq('file_id', fileId);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({
      current_total: leads.length,
      pending: leads.filter(l => l.status === 'pending').length,
      processing: leads.filter(l => l.status === 'processing').length,
      completed: leads.filter(l => l.status === 'completed').length,
      failed: leads.filter(l => l.status === 'failed').length,
      with_ceo: leads.filter(l => l.ceo_name).length
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check duplicates route
router.post('/check-duplicates', async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Invalid leads data' });
    }
    
    console.log(`🔍 Checking ${leads.length} leads for duplicates...`);
    
    const duplicateResults = [];
    
    // Check each lead individually for duplicates
    for (const lead of leads) {
      const fullName = String(lead.fullName || '').toLowerCase().trim();
      const company = String(lead.company || '').toLowerCase().trim();
      
      if (!fullName || !company) {
        duplicateResults.push(false);
        continue;
      }
      
      const { data: existingLead, error } = await supabase
        .from('leads')
        .select('id')
        .ilike('full_name', fullName)
        .ilike('company', company)
        .limit(1);
      
      if (error) {
        console.error('❌ Duplicate check error:', error);
        duplicateResults.push(false);
      } else {
        const isDuplicate = existingLead && existingLead.length > 0;
        duplicateResults.push(isDuplicate);
        
        if (isDuplicate) {
          console.log(`🔄 Duplicate found: ${fullName} - ${company}`);
        }
      }
    }
    
    const duplicateCount = duplicateResults.filter(d => d).length;
    console.log(`✅ Duplicate check complete: ${duplicateCount} duplicates found out of ${leads.length}`);
    
    res.json({ duplicates: duplicateResults });
    
  } catch (error) {
    console.error('❌ Duplicate check error:', error);
    res.json({ duplicates: req.body.leads?.map(() => false) || [] });
  }
});

router.get('/queue-status', async (req, res) => {
  try {
    const { getQueueStats } = require('../utils/queue');
    const stats = await getQueueStats();
    
    res.json({
      success: true,
      queues: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Queue status error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add manual queue trigger for testing
router.post('/trigger-domain-finding', async (req, res) => {
  try {
    const { leadId, company } = req.body;
    
    if (!leadId || !company) {
      return res.status(400).json({ error: 'leadId and company required' });
    }
    
    const { domainQueue } = require('../utils/queue');
    
    if (!domainQueue) {
      return res.status(500).json({ error: 'Domain queue not available' });
    }
    
    await domainQueue.add('find-domain', {
      leadId,
      company,
      userId: 'manual-trigger'
    });
    
    console.log(`🎯 Manually queued domain job for lead ${leadId}: ${company}`);
    
    res.json({
      success: true,
      message: `Domain finding job queued for ${company}`,
      leadId,
      company
    });
    
  } catch (error) {
    console.error('❌ Manual trigger error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;