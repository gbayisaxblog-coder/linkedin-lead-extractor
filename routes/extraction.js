const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../utils/database');
const { domainQueue, ceoQueue } = require('../utils/queue');

const router = express.Router();

router.post('/extract', async (req, res) => {
  try {
    const { leads, fileId, fileName, userId = 'anonymous' } = req.body;
    
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
    
    for (const lead of leads) {
      try {
        const { data: leadData } = await supabase
          .from('leads')
          .insert({
            first_name: lead.firstName || '',
            last_name: lead.lastName || '',
            email: lead.email || `${lead.firstName}.${lead.lastName}@temp.com`,
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
        
        if (leadData) {
          insertedLeads.push(leadData.id);
          
          // Queue CEO finding directly with a simple domain guess
          if (lead.company) {
            const simpleDomain = `${lead.company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
            
            await ceoQueue.add('find-ceo', {
              leadId: leadData.id,
              domain: simpleDomain,
              company: lead.company,
              userId,
              retryCount: 0
            }, {
              delay: Math.random() * 2000
            });
          }
        }
      } catch (error) {
        console.error('Error inserting lead:', error);
      }
    }
    
    res.json({
      success: true,
      fileId: actualFileId,
      insertedCount: insertedLeads.length,
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
      processing: leadsData.filter(l => l.status === 'processing').length,
      with_ceo: leadsData.filter(l => l.ceo_name && l.ceo_name !== '').length
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;