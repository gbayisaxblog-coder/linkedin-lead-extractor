const { Worker } = require('bullmq');
const { createClient } = require('@supabase/supabase-js');
const getProspectService = require('../services/GetProspect');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class EmailWorker {
  constructor() {
    this.worker = null;
  }

  start(connection) {
    console.log('🚀 Starting Email Worker...');
    
    this.worker = new Worker('email-finding', async (job) => {
      return await this.processEmailJob(job);
    }, {
      connection,
      concurrency: 2, // Lower concurrency to avoid rate limits
      removeOnComplete: 100,
      removeOnFail: 50
    });

    this.worker.on('completed', (job) => {
      console.log(`✅ Email job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Email job failed: ${job.id}`, err.message);
    });

    console.log('✅ Email Worker started');
  }

  async processEmailJob(job) {
    const { leadId, fullName, domain } = job.data;
    console.log(`📧 Processing email job for: ${fullName} at ${domain}`);

    try {
      // Parse full name
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || firstName;

      console.log(`👤 Parsed name: ${firstName} ${lastName}`);

      // Find verified email using GetProspect
      const emailResult = await getProspectService.findVerifiedEmail(
        firstName, 
        lastName, 
        domain
      );
      
      if (emailResult && emailResult.email) {
        // Update lead with email
        const { error: updateError } = await supabase
          .from('leads')
          .update({
            email: emailResult.email,
            email_pattern: emailResult.pattern,
            status: 'email_found',
            updated_at: new Date().toISOString()
          })
          .eq('id', leadId);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        console.log(`✅ Email found for ${fullName}: ${emailResult.email} (${emailResult.pattern})`);
        return { 
          success: true, 
          email: emailResult.email, 
          pattern: emailResult.pattern 
        };
        
      } else {
        // No email found
        await supabase
          .from('leads')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', leadId);

        console.log(`❌ No verified email found for ${fullName} at ${domain}`);
        return { success: false, reason: 'No verified email found' };
      }

    } catch (error) {
      console.error(`❌ Email job error for ${fullName}:`, error.message);
      
      // Check if it's a rate limit error
      if (error.message.includes('API_ERROR')) {
        // Don't mark as failed, let it retry
        throw error;
      }
      
      // Update lead status to failed for other errors
      await supabase
        .from('leads')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

      throw error;
    }
  }

  stop() {
    if (this.worker) {
      console.log('🛑 Stopping Email Worker...');
      return this.worker.close();
    }
  }
}

module.exports = EmailWorker;