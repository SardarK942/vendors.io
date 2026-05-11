// Inspect a vendor's profile + stripe_accounts row on PROD.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const email = process.argv[2];
if (!email) { console.error('usage: node scripts/check-vendor-stripe.mjs <email>'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.log('not found'); process.exit(0); }

const { data: pub } = await sb.from('users').select('*').eq('id', user.id).maybeSingle();
console.log('public.users:', pub);

const { data: vp } = await sb.from('vendor_profiles').select('*').eq('user_id', user.id).maybeSingle();
console.log('\nvendor_profiles:', vp);

if (vp) {
  const { data: sa } = await sb.from('stripe_accounts').select('*').eq('vendor_profile_id', vp.id).maybeSingle();
  console.log('\nstripe_accounts:', sa);
}
