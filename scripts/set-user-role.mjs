// One-off: force-set a user's role on PROD. Service-role bypasses RLS.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const email = process.argv[2];
const role = process.argv[3];
if (!email || !['couple', 'vendor', 'admin'].includes(role)) {
  console.error('usage: node scripts/set-user-role.mjs <email> <couple|vendor|admin>');
  process.exit(1);
}

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.log('not found'); process.exit(0); }

const { data, error } = await sb.from('users').update({ role }).eq('id', user.id).select();
if (error) { console.error(error); process.exit(1); }
console.log(`Updated ${email} (${user.id}) → role: ${role}`);
console.log(data);
