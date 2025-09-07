const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// BULLETPROOF QUEUE ACCESS with retry logic
async function queueDomainJob(leadId, company, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Get queue at runtime
      const { domainQueue } = require('../utils/queue');
      
      if (!domainQueue) {
        if (attempt < retries) {
          console.log(`⏳ Domain queue not ready, attempt ${attempt}/${retries} - waiting...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          continue;
        } else {
          console.log(`❌ Domain queue not available after ${retries} attempts for lead ${leadId}`);
          return false;
        }
      }
      
      await domainQueue.add('findDomain', {
        leadId: leadId,
        company: company
      });
      
      console.log(`🔄 Queued domain search for lead ${leadId}: ${company}`);
      return true;
      
    } catch (error) {
      if (attempt < retries) {
        console.log(`⚠️ Queue attempt ${attempt}/${retries} failed for lead ${leadId}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error(`❌ Final queue error for lead ${leadId}:`, error.message);
        return false;
      }
    }
  }
  
  return false;
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
    const queuedJobs = []; // Track queuing for batch processing
    
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
          const leadId = data[0].id;
          console.log(`✅ [${i + 1}] Success: ID ${leadId}`);
          insertedCount++;
          
          // Store for batch queuing after all insertions
          queuedJobs.push({ leadId, company });
          
        } else {
          console.log(`🔄 [${i + 1}] No data returned`);
          skippedCount++;
        }
        
      } catch (insertError) {
        console.error(`❌ [${i + 1}] Exception:`, insertError.message);
        skippedCount++;
      }
    }
    
    console.log('=== SUMMARY ===');
    console.log(`✅ Inserted: ${insertedCount}`);
    console.log(`🔄 Skipped: ${skippedCount}`);
    console.log('===============');
    
    // BATCH QUEUE DOMAIN JOBS AFTER ALL INSERTIONS
    if (queuedJobs.length > 0) {
      console.log(`🔄 Starting batch domain queuing for ${queuedJobs.length} leads...`);
      
      let queuedCount = 0;
      for (const job of queuedJobs) {
        const queued = await queueDomainJob(job.leadId, job.company);
        if (queued) queuedCount++;
      }
      
      console.log(`✅ Batch queuing complete: ${queuedCount}/${queuedJobs.length} domain jobs queued`);
    }
    
    res.json({
      success: true,
      insertedCount: insertedCount,
      skippedCount: skippedCount,
      totalProcessed: leads.length
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
      .select('status, domain, ceo_name')
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

module.exports = router;