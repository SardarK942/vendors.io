// Show recent Stripe webhook events from the audit table.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb.from('stripe_events').select('*').order('received_at', { ascending: false }).limit(15);
if (error) { console.error(error); process.exit(1); }

console.log(`Recent stripe_events (${data?.length ?? 0}):`);
for (const e of data ?? []) {
  console.log(`\n  ${e.received_at}  ${e.event_type}  status=${e.status}`);
  console.log(`    event_id=${e.event_id}`);
  if (e.error_message) console.log(`    error=${e.error_message}`);
}
