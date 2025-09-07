// routes/extraction.js - COMPLETE FIXED VERSION WITH QUEUE GETTERS
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
    
    // Queue domain finding jobs for inserted leads - FIXED WITH GETTER FUNCTIONS
    let queuedJobs = 0;
    if (insertedLeads.length > 0) {
      console.log('🔍 DEBUG: Starting queue process...');
      console.log(`🔍 DEBUG: Have ${insertedLeads.length} leads to queue`);
      
      try {
        console.log('🔍 DEBUG: Step 1 - Loading queue module...');
        
        const queueModule = require('../utils/queue');
        console.log('✅ DEBUG: Queue module loaded successfully');
        console.log('🔍 DEBUG: Queue module type:', typeof queueModule);
        console.log('🔍 DEBUG: Queue initialized:', queueModule.initialized);
        console.log('🔍 DEBUG: Available methods:', Object.keys(queueModule));
        
        // Use getter function instead of direct property access
        console.log('🔍 DEBUG: Step 2 - Getting domain queue via getter...');
        const domainQueue = queueModule.getDomainQueue();
        
        console.log('🔍 DEBUG: Domain queue from getter:', !!domainQueue);
        console.log('🔍 DEBUG: Domain queue type:', typeof domainQueue);
        
        if (domainQueue) {
          console.log('✅ DEBUG: Domain queue is available!');
          console.log('🔍 DEBUG: Domain queue constructor:', domainQueue.constructor?.name);
          
          // Test if we can call methods on the queue
          try {
            console.log('🔍 DEBUG: Testing queue.getWaiting()...');
            const waitingJobs = await domainQueue.getWaiting();
            console.log('✅ DEBUG: Queue.getWaiting() works, waiting jobs:', waitingJobs.length);
          } catch (testError) {
            console.error('❌ DEBUG: Queue.getWaiting() failed:', testError.message);
          }
          
          console.log(`🚀 Queueing ${insertedLeads.length} domain finding jobs...`);
          
          for (const lead of insertedLeads) {
            try {
              console.log(`🔍 DEBUG: Processing lead ${lead.id} - ${lead.company}`);
              
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
              
              console.log(`🔄 DEBUG: About to queue job with data:`, jobData);
              
              const job = await domainQueue.add('find-domain', jobData, {
                delay: Math.random() * 5000 // Random delay 0-5 seconds
              });
              
              console.log(`🎯 SUCCESS: Queued domain job ${job.id} for lead ${lead.id}: ${lead.company}`);
              queuedJobs++;
              
            } catch (queueError) {
              console.error(`❌ DEBUG: Failed to queue job for lead ${lead.id}:`, queueError.message);
              console.error(`❌ DEBUG: Queue error stack:`, queueError.stack);
            }
          }
          
          console.log(`✅ DEBUG: Finished queueing. Total queued: ${queuedJobs}`);
          
        } else {
          console.error('❌ DEBUG: Domain queue is NULL/UNDEFINED from getter!');
          console.error('❌ DEBUG: Queue module initialized:', queueModule.initialized);
          console.error('❌ DEBUG: Direct queue access:', !!queueModule.domainQueue);
          console.log('⚠️ Domain queue not available, leads will need manual processing');
        }
        
      } catch (queueError) {
        console.error('❌ DEBUG: Queue process error:', queueError.message);
        console.error('❌ DEBUG: Queue error stack:', queueError.stack);
      }
    } else {
      console.log('🔍 DEBUG: No leads to queue (insertedLeads.length = 0)');
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
    console.error('❌ Route error stack:', error.stack);
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

// DEBUG ROUTE - Test queue system directly
router.get('/debug-queue', async (req, res) => {
  try {
    console.log('🔍 DEBUG ROUTE: Testing queue system...');
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Test 1: Can we load the queue module?
    let queueModule;
    try {
      queueModule = require('../utils/queue');
      debugInfo.moduleLoaded = true;
      debugInfo.moduleType = typeof queueModule;
      debugInfo.moduleKeys = Object.keys(queueModule);
      debugInfo.initialized = queueModule.initialized;
      console.log('✅ DEBUG: Queue module loaded successfully');
      console.log('🔍 DEBUG: Queue initialized:', queueModule.initialized);
    } catch (moduleError) {
      console.error('❌ DEBUG: Failed to load queue module:', moduleError.message);
      debugInfo.moduleLoaded = false;
      debugInfo.moduleError = moduleError.message;
      return res.json({ success: false, debug: debugInfo });
    }
    
    // Test 2: Extract queues using both methods
    const directDomainQueue = queueModule.domainQueue;
    const getterDomainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : null;
    const { ceoQueue, emailQueue, redisConnection } = queueModule;
    
    debugInfo.queues = {
      domain: {
        directExists: !!directDomainQueue,
        getterExists: !!getterDomainQueue,
        directType: typeof directDomainQueue,
        getterType: typeof getterDomainQueue,
        constructor: getterDomainQueue?.constructor?.name || directDomainQueue?.constructor?.name
      },
      ceo: {
        exists: !!ceoQueue,
        type: typeof ceoQueue,
        constructor: ceoQueue?.constructor?.name
      },
      email: {
        exists: !!emailQueue,
        type: typeof emailQueue,
        constructor: emailQueue?.constructor?.name
      },
      redis: {
        exists: !!redisConnection,
        type: typeof redisConnection,
        constructor: redisConnection?.constructor?.name
      }
    };
    
    console.log('🔍 DEBUG: Queue availability:', debugInfo.queues);
    
    // Test 3: Test queue operations with the working queue
    const workingQueue = getterDomainQueue || directDomainQueue;
    if (workingQueue) {
      try {
        const waiting = await workingQueue.getWaiting();
        const active = await workingQueue.getActive();
        const completed = await workingQueue.getCompleted();
        const failed = await workingQueue.getFailed();
        
        debugInfo.queueStats = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length
        };
        
        console.log('✅ DEBUG: Queue stats retrieved:', debugInfo.queueStats);
      } catch (statsError) {
        console.error('❌ DEBUG: Failed to get queue stats:', statsError.message);
        debugInfo.statsError = statsError.message;
      }
      
      // Test 4: Try adding a test job
      try {
        const testJob = await workingQueue.add('debug-test', {
          leadId: 'debug-test-' + Date.now(),
          company: 'Debug Test Company',
          userId: 'debug-route'
        });
        
        debugInfo.testJob = {
          success: true,
          jobId: testJob.id,
          jobName: testJob.name
        };
        
        console.log('✅ DEBUG: Test job added successfully:', debugInfo.testJob);
      } catch (jobError) {
        console.error('❌ DEBUG: Failed to add test job:', jobError.message);
        debugInfo.testJob = {
          success: false,
          error: jobError.message
        };
      }
    }
    
    res.json({
      success: true,
      debug: debugInfo
    });
    
  } catch (error) {
    console.error('❌ DEBUG ROUTE: Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Queue monitoring route
router.get('/queue-status', async (req, res) => {
  try {
    console.log('🔍 QUEUE STATUS: Checking queue status...');
    
    const queueModule = require('../utils/queue');
    
    // Try both getQueueStats and manual stats
    let stats;
    try {
      if (queueModule.getQueueStats) {
        stats = await queueModule.getQueueStats();
      } else {
        // Manual stats gathering
        const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
        const ceoQueue = queueModule.getCeoQueue ? queueModule.getCeoQueue() : queueModule.ceoQueue;
        
        if (domainQueue && ceoQueue) {
          stats = {
            initialized: queueModule.initialized,
            domain: {
              waiting: await domainQueue.getWaiting().then(jobs => jobs.length),
              active: await domainQueue.getActive().then(jobs => jobs.length),
              completed: await domainQueue.getCompleted().then(jobs => jobs.length),
              failed: await domainQueue.getFailed().then(jobs => jobs.length)
            },
            ceo: {
              waiting: await ceoQueue.getWaiting().then(jobs => jobs.length),
              active: await ceoQueue.getActive().then(jobs => jobs.length),
              completed: await ceoQueue.getCompleted().then(jobs => jobs.length),
              failed: await ceoQueue.getFailed().then(jobs => jobs.length)
            }
          };
        } else {
          stats = { error: 'Queues not available' };
        }
      }
    } catch (statsError) {
      stats = { error: statsError.message };
    }
    
    console.log('✅ QUEUE STATUS: Stats retrieved:', stats);
    
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

// Manual queue trigger for testing - FIXED WITH GETTER
router.post('/trigger-domain-finding', async (req, res) => {
  try {
    const { leadId, company } = req.body;
    
    console.log('🔍 MANUAL TRIGGER: Request received:', { leadId, company });
    
    if (!leadId || !company) {
      return res.status(400).json({ error: 'leadId and company required' });
    }
    
    console.log('🔍 MANUAL TRIGGER: Loading queue module...');
    const queueModule = require('../utils/queue');
    
    console.log('🔍 MANUAL TRIGGER: Queue initialized:', queueModule.initialized);
    
    // Use getter function if available, otherwise direct access
    const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
    
    console.log('🔍 MANUAL TRIGGER: Domain queue available:', !!domainQueue);
    console.log('🔍 MANUAL TRIGGER: Domain queue type:', typeof domainQueue);
    
    if (!domainQueue) {
      return res.status(500).json({ 
        error: 'Domain queue not available',
        initialized: queueModule.initialized,
        debug: 'Queue may not be initialized yet'
      });
    }
    
    const jobData = {
      leadId: leadId,
      company: company,
      userId: 'manual-trigger'
    };
    
    console.log(`🔄 MANUAL TRIGGER: Adding job with data:`, jobData);
    
    const job = await domainQueue.add('find-domain', jobData);
    
    console.log(`🎯 MANUAL TRIGGER: Successfully queued job ${job.id} for lead ${leadId}: ${company}`);
    
    res.json({
      success: true,
      message: `Domain finding job queued for ${company}`,
      jobId: job.id,
      leadId,
      company
    });
    
  } catch (error) {
    console.error('❌ MANUAL TRIGGER: Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;