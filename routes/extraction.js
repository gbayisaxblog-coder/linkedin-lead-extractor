const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../utils/database');
const { domainQueue } = require('../utils/queue');

const router = express.Router();

// Debug route
router.get('/debug/queues', async (req, res) => {
  try {
    const { domainQueue, ceoQueue } = require('../utils/queue');
    
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

// Batch duplicate checking
router.post('/check-batch-duplicates', async (req, res) => {
  try {
    const { leads } = req.body;
    
    console.log(`🔍 Checking ${leads.length} leads for duplicates...`);
    
    if (!leads || !Array.isArray(leads)) {
      return res.json({ duplicates: [] });
    }
    
    const checkPromises = leads.map(async (lead) => {
      try {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('first_name', lead.firstName)
          .eq('last_name', lead.lastName)
          .eq('company', lead.company)
          .single();
        
        return !!existingLead;
      } catch (error) {
        return false;
      }
    });
    
    const results = await Promise.all(checkPromises);
    
    console.log(`✅ Duplicate check complete: ${results.filter(r => r).length} duplicates found`);
    
    res.json({ duplicates: results });
    
  } catch (error) {
    console.error('Batch duplicate check error:', error);
    res.json({ duplicates: [] });
  }
});

// Extract leads
router.post('/extract', async (req, res) => {
  try {
    const { leads, fileId, fileName, userId = 'anonymous' } = req.body;
    
    console.log(`📥 Received ${leads.length} leads for processing`);
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'No leads provided' });
    }
    
    let actualFileId = fileId;
    if (!actualFileId) {
      const { data: fileData } = await supabase
        .from('extraction_files')
        .insert({
          name: fileName || `Extract_${Date.now()}`,
          total_leads: leads.length
        })
        .select()
        .single();
      
      actualFileId = fileData.id;
    }
    
    const insertedLeads = [];
    let skippedCount = 0;
    
    for (const lead of leads) {
      try {
        const tempEmail = `${lead.firstName}.${lead.lastName}.${Date.now()}@temp.com`;
        
        console.log(`💾 Inserting lead: ${lead.firstName} ${lead.lastName} - ${lead.company}`);
        
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
          console.log(`❌ Error inserting lead: ${error.message}`);
          skippedCount++;
          continue;
        }
        
        if (leadData) {
          insertedLeads.push(leadData.id);
          
          await domainQueue.add('find-domain', {
            leadId: leadData.id,
            company: lead.company,
            userId
          }, {
            delay: Math.random() * 1000
          });
          
          console.log(`✅ Queued domain search for lead ${leadData.id}: ${lead.company}`);
        }
      } catch (error) {
        console.error('Error processing lead:', error);
        skippedCount++;
      }
    }
    
    console.log(`✅ Inserted ${insertedLeads.length} leads, skipped ${skippedCount}`);
    
    res.json({
      success: true,
      fileId: actualFileId,
      insertedCount: insertedLeads.length,
      skippedCount: skippedCount,
      totalLeads: leads.length
    });
    
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error('Status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;