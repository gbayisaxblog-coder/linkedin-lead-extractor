// routes/extraction.js - UPDATED FOR SIMPLIFIED SCHEMA (keeping all functions)
const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// Bulletproof extract route (UPDATED for simplified schema)
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
    const insertedLeads = [];
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      
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
        
        // UPDATED: Insert with new simplified schema
        const { data, error } = await supabase
          .from('leads')
          .insert([{
            full_name: fullName,
            company: company,
            file_id: fileId,
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
    
    // Queue domain finding jobs (UPDATED: Include fullName for email worker)
    let queuedJobs = 0;
    if (insertedLeads.length > 0) {
      try {
        const queueModule = require('../utils/queue');
        const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
        
        if (domainQueue) {
          console.log(`🚀 Queueing ${insertedLeads.length} domain finding jobs...`);
          
          for (const lead of insertedLeads) {
            try {
              const jobData = {
                leadId: lead.id,
                company: lead.company,
                fullName: lead.fullName, // ADDED: Include fullName for email worker
                userId: 'chrome_extension'
              };
              
              const job = await domainQueue.add('find-domain', jobData, {
                delay: Math.random() * 5000
              });
              
              console.log(`🎯 Queued domain job ${job.id} for lead ${lead.id}: ${lead.company}`);
              queuedJobs++;
              
            } catch (queueError) {
              console.error(`❌ Failed to queue job for lead ${lead.id}:`, queueError.message);
            }
          }
        } else {
          console.log('⚠️ Domain queue not available');
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

// Get stats (UPDATED for new schema)
router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: leads, error } = await supabase
      .from('leads')
      .select('status, email, domain') // UPDATED: Use email instead of ceo_name
      .eq('file_id', fileId);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({
      current_total: leads.length,
      pending: leads.filter(l => l.status === 'pending').length,
      processing: leads.filter(l => l.status === 'processing').length,
      domain_found: leads.filter(l => l.status === 'domain_found').length, // NEW
      email_found: leads.filter(l => l.status === 'email_found').length, // NEW
      completed: leads.filter(l => l.status === 'email_found').length, // UPDATED: email_found = completed
      failed: leads.filter(l => l.status === 'failed').length,
      released: leads.filter(l => l.status === 'released').length,
      with_domain: leads.filter(l => l.domain).length,
      with_email: leads.filter(l => l.email).length, // NEW
      with_ceo: leads.filter(l => l.email).length // UPDATED: For UI compatibility, use email count
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check duplicates route (KEEP AS IS)
router.post('/check-duplicates', async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Invalid leads data' });
    }
    
    console.log(`🔍 Checking ${leads.length} leads for duplicates...`);
    
    const duplicateResults = [];
    
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

// Manual trigger to process pending leads (KEEP AS IS)
router.post('/trigger-pending-processing', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Processing pending leads...');
    
    const { data: pendingLeads, error } = await supabase
      .from('leads')
      .select('id, company, domain, full_name') // ADDED: full_name for email worker
      .eq('status', 'pending')
      .limit(100);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    console.log(`🔍 Found ${pendingLeads.length} pending leads`);
    
    const queueModule = require('../utils/queue');
    const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
    
    if (!domainQueue) {
      return res.status(500).json({ error: 'Domain queue not available' });
    }
    
    let queuedJobs = 0;
    
    for (const lead of pendingLeads) {
      try {
        await domainQueue.add('find-domain', {
          leadId: lead.id,
          company: lead.company,
          fullName: lead.full_name, // ADDED: Include fullName
          userId: 'manual-pending-trigger'
        }, {
          delay: Math.random() * 2000
        });
        
        queuedJobs++;
        console.log(`🎯 Queued domain job for: ${lead.company}`);
      } catch (queueError) {
        console.error(`❌ Failed to queue job for ${lead.id}:`, queueError.message);
      }
    }
    
    res.json({
      success: true,
      message: `Queued ${queuedJobs} domain finding jobs for pending leads`,
      pendingLeads: pendingLeads.length,
      queuedJobs: queuedJobs
    });
    
  } catch (error) {
    console.error('❌ Manual pending trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger to process leads stuck in processing (UPDATED for new flow)
router.post('/trigger-stuck-processing', async (req, res) => {
  try {
    console.log('🔄 Manual trigger: Reprocessing stuck leads...');
    
    // Get leads stuck in processing for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const { data: stuckLeads, error } = await supabase
      .from('leads')
      .select('id, company, domain, full_name') // ADDED: full_name
      .eq('status', 'processing')
      .lt('updated_at', tenMinutesAgo)
      .limit(100);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    console.log(`🔍 Found ${stuckLeads.length} stuck processing leads`);
    
    // Reset them to pending
    if (stuckLeads.length > 0) {
      const { error: resetError } = await supabase
        .from('leads')
        .update({ status: 'pending' })
        .in('id', stuckLeads.map(l => l.id));
      
      if (resetError) {
        return res.status(500).json({ error: resetError.message });
      }
      
      console.log(`✅ Reset ${stuckLeads.length} stuck leads to pending`);
    }
    
    const queueModule = require('../utils/queue');
    const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
    const emailQueue = queueModule.getEmailQueue ? queueModule.getEmailQueue() : queueModule.emailQueue; // UPDATED: Use email queue instead of CEO
    
    let queuedJobs = 0;
    
    for (const lead of stuckLeads) {
      try {
        if (lead.domain && emailQueue) {
          // UPDATED: Has domain, queue EMAIL job instead of CEO
          await emailQueue.add('find-email', {
            leadId: lead.id,
            domain: lead.domain,
            fullName: lead.full_name,
            userId: 'manual-stuck-trigger'
          });
          queuedJobs++;
          console.log(`🎯 Requeued EMAIL job: ${lead.full_name} (${lead.domain})`);
        } else if (domainQueue) {
          // No domain, queue domain job
          await domainQueue.add('find-domain', {
            leadId: lead.id,
            company: lead.company,
            fullName: lead.full_name, // ADDED: Include fullName
            userId: 'manual-stuck-trigger'
          });
          queuedJobs++;
          console.log(`🎯 Requeued domain job: ${lead.company}`);
        }
      } catch (queueError) {
        console.error(`❌ Failed to requeue ${lead.id}:`, queueError.message);
      }
    }
    
    res.json({
      success: true,
      message: `Reset and requeued ${queuedJobs} stuck leads`,
      stuckLeads: stuckLeads.length,
      queuedJobs: queuedJobs
    });
    
  } catch (error) {
    console.error('❌ Manual stuck trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CACHE CLEARING ROUTES (KEEP AS IS)
router.post('/clear-domain-cache', async (req, res) => {
  try {
    const { company } = req.body;
    
    if (!company) {
      return res.status(400).json({ error: 'Company name required' });
    }
    
    const cache = require('../services/cache');
    const cacheKey = `domain:${company.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    
    console.log(`🗑️ Clearing domain cache for: ${company} (key: ${cacheKey})`);
    
    const result = await cache.del(cacheKey);
    
    res.json({
      success: true,
      message: `Domain cache cleared for ${company}`,
      cacheKey: cacheKey,
      cleared: result
    });
    
  } catch (error) {
    console.error('❌ Clear domain cache error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATED: Clear email cache (instead of CEO cache)
router.post('/clear-email-cache', async (req, res) => {
  try {
    const { fullName, domain } = req.body;
    
    if (!fullName || !domain) {
      return res.status(400).json({ error: 'Full name and domain required' });
    }
    
    const cache = require('../services/cache');
    const cacheKey = `email:${fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}:${domain.toLowerCase()}`;
    
    console.log(`🗑️ Clearing email cache for: ${fullName} at ${domain} (key: ${cacheKey})`);
    
    const result = await cache.del(cacheKey);
    
    res.json({
      success: true,
      message: `Email cache cleared for ${fullName} at ${domain}`,
      cacheKey: cacheKey,
      cleared: result
    });
    
  } catch (error) {
    console.error('❌ Clear email cache error:', error);
    res.status(500).json({ error: error.message });
  }
});

// KEEP: CEO cache clearing for backward compatibility
router.post('/clear-ceo-cache', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }
    
    const cache = require('../services/cache');
    const cacheKey = `ceo:${domain.toLowerCase()}`;
    
    console.log(`🗑️ Clearing CEO cache for: ${domain} (key: ${cacheKey})`);
    
    const result = await cache.del(cacheKey);
    
    res.json({
      success: true,
      message: `CEO cache cleared for ${domain}`,
      cacheKey: cacheKey,
      cleared: result
    });
    
  } catch (error) {
    console.error('❌ Clear CEO cache error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/clear-all-cache', async (req, res) => {
  try {
    console.log(`🗑️ CLEARING ALL CACHE...`);
    
    const cache = require('../services/cache');
    
    // Use the correct flushall method
    const result = await cache.flushall();
    
    console.log(`✅ ALL CACHE CLEARED:`, result);
    
    res.json({
      success: true,
      message: "All cache cleared successfully",
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Clear all cache error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check specific lead status (UPDATED for new schema)
router.get('/check-lead/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    
    console.log(`🔍 Checking lead: ${leadId}`);
    
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json({
      success: true,
      lead: {
        id: lead.id,
        full_name: lead.full_name,
        company: lead.company,
        domain: lead.domain,
        email: lead.email, // UPDATED: Show email instead of ceo_name
        email_pattern: lead.email_pattern, // NEW
        ceo_name: lead.email, // For backward compatibility
        status: lead.status,
        created_at: lead.created_at,
        updated_at: lead.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Check lead error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual domain trigger (KEEP AS IS)
router.post('/trigger-domain-finding', async (req, res) => {
  try {
    const { leadId, company } = req.body;
    
    if (!leadId || !company) {
      return res.status(400).json({ error: 'leadId and company required' });
    }
    
    const queueModule = require('../utils/queue');
    const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
    
    if (!domainQueue) {
      return res.status(500).json({ error: 'Domain queue not available' });
    }
    
    const jobData = {
      leadId: leadId,
      company: company,
      userId: 'manual-trigger'
    };
    
    const job = await domainQueue.add('find-domain', jobData);
    
    console.log(`🎯 Manual domain job queued: ${job.id} for ${company}`);
    
    res.json({
      success: true,
      message: `Domain finding job queued for ${company}`,
      jobId: job.id,
      leadId,
      company
    });
    
  } catch (error) {
    console.error('❌ Manual domain trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW: Manual email trigger
router.post('/trigger-email-finding', async (req, res) => {
  try {
    const { leadId, fullName, domain } = req.body;
    
    if (!leadId || !fullName || !domain) {
      return res.status(400).json({ error: 'leadId, fullName, and domain required' });
    }
    
    const queueModule = require('../utils/queue');
    const emailQueue = queueModule.getEmailQueue ? queueModule.getEmailQueue() : queueModule.emailQueue;
    
    if (!emailQueue) {
      return res.status(500).json({ error: 'Email queue not available' });
    }
    
    const jobData = {
      leadId: leadId,
      fullName: fullName,
      domain: domain,
      userId: 'manual-trigger'
    };
    
    const job = await emailQueue.add('find-email', jobData);
    
    console.log(`🎯 Manual email job queued: ${job.id} for ${fullName} at ${domain}`);
    
    res.json({
      success: true,
      message: `Email finding job queued for ${fullName} at ${domain}`,
      jobId: job.id,
      leadId,
      fullName,
      domain
    });
    
  } catch (error) {
    console.error('❌ Manual email trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Queue status route (UPDATED to include email queue)
router.get('/queue-status', async (req, res) => {
  try {
    const queueModule = require('../utils/queue');
    
    let stats;
    try {
      if (queueModule.getQueueStats) {
        stats = await queueModule.getQueueStats();
      } else {
        const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
        const emailQueue = queueModule.getEmailQueue ? queueModule.getEmailQueue() : queueModule.emailQueue; // UPDATED
        
        if (domainQueue && emailQueue) {
          stats = {
            initialized: queueModule.initialized,
            domain: {
              waiting: await domainQueue.getWaiting().then(jobs => jobs.length),
              active: await domainQueue.getActive().then(jobs => jobs.length),
              completed: await domainQueue.getCompleted().then(jobs => jobs.length),
              failed: await domainQueue.getFailed().then(jobs => jobs.length)
            },
            email: { // UPDATED: Email queue instead of CEO
              waiting: await emailQueue.getWaiting().then(jobs => jobs.length),
              active: await emailQueue.getActive().then(jobs => jobs.length),
              completed: await emailQueue.getCompleted().then(jobs => jobs.length),
              failed: await emailQueue.getFailed().then(jobs => jobs.length)
            },
            ceo: { // KEEP for backward compatibility
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0
            }
          };
        } else {
          stats = { error: 'Queues not available' };
        }
      }
    } catch (statsError) {
      stats = { error: statsError.message };
    }
    
    res.json({
      success: true,
      queues: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Queue status error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;