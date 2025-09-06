const { createClient } = require('@supabase/supabase-js');

// Ensure dotenv is loaded
require('dotenv').config();

// Debug environment variables
console.log('=== ENVIRONMENT DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Present' : 'MISSING');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Present (length: ' + process.env.SUPABASE_SERVICE_KEY.length + ')' : 'MISSING');
console.log('REDIS_URL:', process.env.REDIS_URL ? 'Present' : 'MISSING');
console.log('BRIGHTDATA_API_KEY:', process.env.BRIGHTDATA_API_KEY ? 'Present' : 'MISSING');
console.log('=========================');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  throw new Error('❌ SUPABASE_URL environment variable is missing. Check Railway variables.');
}

if (!supabaseServiceKey) {
  throw new Error('❌ SUPABASE_SERVICE_KEY environment variable is missing. Check Railway variables.');
}

console.log('✅ Creating Supabase client...');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('✅ Supabase client created successfully');

module.exports = supabase;