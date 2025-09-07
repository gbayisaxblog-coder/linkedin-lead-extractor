const express = require('express');
const { supabase } = require('../utils/database');
const router = express.Router();

// BULLETPROOF QUEUE ACCESS with readiness check
async function queueDomainJob(leadId, company) {
  try {
    const { domainQueue, areQueuesReady } = require('../utils/queue');
    
    // Check if queues are ready
    if (!areQueuesReady()) {
      console.log(`⚠️ Queues not ready yet for lead ${leadId}, will queue in background`);
      
      // Queue the job for later processing
      setTimeout(async () => {
        console.log(`🔄 Retrying domain queue for lead ${leadId} after delay...`);
        await queueDomainJobDelayed(leadId, company);
      }, 5000);
      
      return true; // Return success to not block extraction
    }
    
    await domainQueue.add('findDomain', {
      leadId: leadId,
      company: company
    });
    
    console.log(`🔄 Queued domain search for lead ${leadId}: ${company}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Queue error for lead ${leadId}:`, error.message);
    return false;
  }
}

async function queueDomainJobDelayed(leadId, company, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { domainQueue, areQueuesReady } = require('../utils/queue');
      
      if (areQueuesReady()) {
        await domainQueue.add('findDomain', {
          leadId: leadId,
          company: company
        });
        
        console.log(`🔄 DELAYED: Queued domain search for lead ${leadId}: ${company}`);
        return true;
      } else {
        console.log(`⏳ DELAYED: Attempt ${attempt}/${maxRetries} - queues not ready for lead ${leadId}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.error(`❌ DELAYED: Queue error attempt ${attempt} for lead ${leadId}:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.error(`❌ DELAYED: Failed to queue domain job for lead ${leadId} after ${maxRetries} attempts`);
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
          
          // BULLETPROOF DOMAIN QUEUING
          const queued = await queueDomainJob(leadId, company);
          if (!queued) {
            console.log(`⚠️ [${i + 1}] Domain queuing deferred for: ${company}`);
          }
          
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