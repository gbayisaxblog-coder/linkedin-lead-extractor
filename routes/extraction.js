const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Extract and save leads (simplified)
router.post('/extract', async (req, res) => {
  try {
    console.log('📨 Extraction request received');
    const { leads, fileId, fileName } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'No leads provided' });
    }
    
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    console.log(`📊 Processing ${leads.length} leads for file ${fileId}`);
    
    // Prepare leads for insertion (only fullname and company)
    const leadsToInsert = leads.map(lead => ({
      file_id: fileId,
      full_name: lead.fullName?.trim(),
      company: lead.company?.trim(),
      status: 'pending',
      created_at: new Date().toISOString()
    })).filter(lead => lead.full_name && lead.company);
    
    console.log(`📊 ${leadsToInsert.length} valid leads after filtering`);
    
    if (leadsToInsert.length === 0) {
      return res.status(400).json({ error: 'No valid leads to process' });
    }
    
    // Insert leads into database
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select('id, full_name, company')
      .onConflict('full_name, company, file_id')
      .ignoreDuplicates();
    
    if (insertError) {
      console.error('❌ Database insertion error:', insertError);
      return res.status(500).json({ error: 'Database insertion failed' });
    }
    
    const insertedCount = insertedLeads?.length || 0;
    console.log(`✅ Inserted ${insertedCount} new leads`);
    
    // Update file statistics
    await supabase
      .from('files')
      .update({ 
        total_leads: supabase.sql`total_leads + ${insertedCount}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', fileId);
    
    // Queue domain finding jobs for new leads
    if (insertedLeads && insertedLeads.length > 0) {
      try {
        const queueModule = require('../utils/queue');
        const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
        
        if (domainQueue) {
          for (const lead of insertedLeads) {
            await domainQueue.add('find-domain', {
              leadId: lead.id,
              company: lead.company,
              fullName: lead.full_name
            });
          }
          console.log(`🚀 Queued ${insertedLeads.length} domain finding jobs`);
        }
      } catch (queueError) {
        console.error('⚠️ Failed to queue domain jobs:', queueError.message);
      }
    }
    
    res.json({
      success: true,
      insertedCount: insertedCount,
      duplicatesSkipped: leads.length - insertedCount,
      message: `Successfully processed ${insertedCount} leads`
    });
    
  } catch (error) {
    console.error('❌ Extraction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check for duplicates
router.post('/check-duplicates', async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'Invalid leads data' });
    }
    
    // Check which leads already exist
    const duplicateChecks = await Promise.all(
      leads.map(async (lead) => {
        const { data } = await supabase
          .from('leads')
          .select('id')
          .eq('full_name', lead.fullName?.trim())
          .eq('company', lead.company?.trim())
          .limit(1);
        
        return data && data.length > 0;
      })
    );
    
    res.json({
      success: true,
      duplicates: duplicateChecks
    });
    
  } catch (error) {
    console.error('❌ Duplicate check error:', error);
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

// Get file statistics (updated for new schema)
router.get('/status/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const { data: stats, error } = await supabase
      .from('leads')
      .select('status, email')
      .eq('file_id', fileId);
    
    if (error) {
      throw error;
    }
    
    const statusCounts = stats.reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {});
    
    res.json({
      current_total: stats.length,
      pending: statusCounts.pending || 0,
      domain_found: statusCounts.domain_found || 0,
      email_found: statusCounts.email_found || 0,
      completed: statusCounts.email_found || 0,
      with_email: statusCounts.email_found || 0,
      with_ceo: statusCounts.email_found || 0, // For compatibility
      failed: statusCounts.failed || 0
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Manual domain finding trigger
router.post('/trigger-domain-finding', async (req, res) => {
  try {
    const { leadId, company } = req.body;
    
    const queueModule = require('../utils/queue');
    const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
    
    if (!domainQueue) {
      return res.status(503).json({ error: 'Queue system not available' });
    }
    
    await domainQueue.add('find-domain', {
      leadId: leadId,
      company: company
    });
    
    res.json({ success: true, message: 'Domain finding job queued' });
    
  } catch (error) {
    console.error('❌ Manual trigger error:', error);
    res.status(500).json({ error: 'Failed to trigger domain finding' });
  }
});

// Queue status
router.get('/queue-status', async (req, res) => {
  try {
    const queueModule = require('../utils/queue');
    
    const domainQueue = queueModule.getDomainQueue ? queueModule.getDomainQueue() : queueModule.domainQueue;
    const emailQueue = queueModule.getEmailQueue ? queueModule.getEmailQueue() : queueModule.emailQueue;
    
    const status = {
      domain_queue: domainQueue ? {
        waiting: await domainQueue.getWaiting().then(jobs => jobs.length),
        active: await domainQueue.getActive().then(jobs => jobs.length),
        completed: await domainQueue.getCompleted().then(jobs => jobs.length),
        failed: await domainQueue.getFailed().then(jobs => jobs.length)
      } : null,
      email_queue: emailQueue ? {
        waiting: await emailQueue.getWaiting().then(jobs => jobs.length),
        active: await emailQueue.getActive().then(jobs => jobs.length),
        completed: await emailQueue.getCompleted().then(jobs => jobs.length),
        failed: await emailQueue.getFailed().then(jobs => jobs.length)
      } : null
    };
    
    res.json({ success: true, queues: status });
    
  } catch (error) {
    console.error('❌ Queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

module.exports = router;