// Quick read-only inspection of a prod user's role + metadata.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const email = process.argv[2];
if (!email) { console.error('usage: node scripts/inspect-user.mjs <email>'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.log('not found'); process.exit(0); }

console.log('auth.users:');
console.log('  id        :', user.id);
console.log('  email     :', user.email);
console.log('  created_at:', user.created_at);
console.log('  provider  :', user.app_metadata?.provider);
console.log('  raw_user_meta_data.role:', user.user_metadata?.role ?? '(not set)');
console.log('  raw_user_meta_data.full_name:', user.user_metadata?.full_name ?? '(not set)');

const { data: pub } = await sb.from('users').select('*').eq('id', user.id).maybeSingle();
console.log('\npublic.users:');
console.log(pub);

const { data: vp } = await sb.from('vendor_profiles').select('id, business_name, created_at').eq('user_id', user.id).maybeSingle();
console.log('\nvendor_profiles:', vp ?? '(none)');
