// routes/extraction.js - COMPLETE FIXED VERSION
const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

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
    let queuedJobs = 0;
    if (insertedLeads.length > 0) {
      try {
        // Get queue reference dynamically
        const { domainQueue } = require('../utils/queue');
        
        if (domainQueue) {
          console.log(`🚀 Queueing ${insertedLeads.length} domain finding jobs...`);
          
          for (const lead of insertedLeads) {
            try {
              // Validate data before queueing
              if (!lead.id || !lead.company) {
                console.error(`❌ Invalid lead data for queueing:`, lead);
                continue;
              }
              
              const jobData = {
                leadId: lead.id,
                company: lead.company,
                userId: 'chrome_extension'
              };
              
              console.log(`🔄 Queueing job with data:`, jobData);
              
              const job = await domainQueue.add('find-domain', jobData, {
                delay: Math.random() * 5000 // Random delay 0-5 seconds
              });
              
              console.log(`🎯 Queued domain job ${job.id} for lead ${lead.id}: ${lead.company}`);
              queuedJobs++;
              
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
    console.log(`🚀 Queued: ${queuedJobs} domain jobs`);
    console.log('===============');
    
    res.json({
      success: true,
      insertedCount: insertedCount,
      skippedCount: skippedCount,
      totalProcessed: leads.length,
      queuedJobs: queuedJobs
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
      .select('status, ceo_name, domain')
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
      with_domain: leads.filter(l => l.domain).length,
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

// Queue monitoring route
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

// Manual queue trigger for testing
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
    
    const jobData = {
      leadId: leadId,
      company: company,
      userId: 'manual-trigger'
    };
    
    console.log(`🔄 Manual trigger with data:`, jobData);
    
    const job = await domainQueue.add('find-domain', jobData);
    
    console.log(`🎯 Manually queued domain job ${job.id} for lead ${leadId}: ${company}`);
    
    res.json({
      success: true,
      message: `Domain finding job queued for ${company}`,
      jobId: job.id,
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