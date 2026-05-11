// Search EVERY public table for an email or text field matching the given email.
// Catches anywhere the email might be lingering after auth user deletion.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const email = process.argv[2];
if (!email) { console.error('usage: node scripts/find-email.mjs <email>'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`Target: ${url}\nSearching for: ${email}\n`);

// 1. auth.users
const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const authMatches = list.users.filter(u => u.email?.toLowerCase() === email.toLowerCase());
console.log(`auth.users: ${authMatches.length} match(es)`);
authMatches.forEach(u => console.log(`  ${u.id} created=${u.created_at} provider=${u.app_metadata?.provider}`));

// 2. Public tables — query each by every text-like column that might hold an email
const tables = [
  { table: 'users', col: 'email' },
  { table: 'vendor_profiles', col: 'business_email' },
  { table: 'vendor_profiles', col: 'contact_email' },
  { table: 'booking_requests', col: 'couple_email' },
  { table: 'reviews', col: 'reviewer_email' },
];

for (const { table, col } of tables) {
  const { data, error } = await sb.from(table).select('id').eq(col, email);
  if (error) {
    if (error.code === '42703') continue; // column doesn't exist — skip silently
    console.log(`${table}.${col}: ERROR ${error.message}`);
  } else {
    console.log(`${table}.${col}: ${data?.length ?? 0} match(es)${data?.length ? ' — ' + data.map(r => r.id).join(', ') : ''}`);
  }
}

// 3. Get list of ALL public tables and dump any rows where ANY text col matches
const { data: schemaTables } = await sb.rpc('pg_tables_in_public').catch(() => ({ data: null }));
if (schemaTables) {
  console.log('\nAll public tables:');
  schemaTables.forEach(t => console.log(`  ${t}`));
}
