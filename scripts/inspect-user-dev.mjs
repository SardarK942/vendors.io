// Read-only inspection of a DEV Supabase user. Uses active .env.local creds.
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) { console.error('usage: node scripts/inspect-user-dev.mjs <email>'); process.exit(1); }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (await import('fs')).readFileSync('.env.local', 'utf8')
  .match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (await import('fs')).readFileSync('.env.local', 'utf8')
  .match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.log('not found'); process.exit(0); }

console.log('Target:', url);
console.log('auth.users:');
console.log('  id        :', user.id);
console.log('  email     :', user.email);
console.log('  provider  :', user.app_metadata?.provider);
console.log('  raw_user_meta_data.role:', user.user_metadata?.role ?? '(not set)');

const { data: pub } = await sb.from('users').select('id,email,role,full_name,created_at').eq('id', user.id).maybeSingle();
console.log('\npublic.users:', pub);
