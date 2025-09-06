require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('🔧 Initializing Supabase client...');
console.log('📅 Environment:', process.env.NODE_ENV);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('SUPABASE_URL present:', !!supabaseUrl);
  console.error('SUPABASE_SERVICE_KEY present:', !!supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase client created successfully');

module.exports = { supabase };