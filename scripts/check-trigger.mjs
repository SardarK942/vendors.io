// Check whether the booking_completed_unlocks_transactions trigger exists on prod.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

// Run a raw SQL via a trick: call an arbitrary RPC if available, else use REST
// to information_schema. Supabase exposes pg_catalog views via PostgREST.
const { data, error } = await sb
  .rpc('pg_get_triggers_for_booking_requests')
  .catch(() => ({ data: null, error: { message: 'no rpc' } }));

if (error) {
  // Fallback — query the booking_requests row to see if there's an updated_at change post-trigger
  console.log('No introspection RPC. Manually verify trigger via Supabase SQL editor:');
  console.log(`
SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid = 'public.booking_requests'::regclass
  AND tgname NOT LIKE 'RI_%'
ORDER BY tgname;
`);
  process.exit(0);
}

console.log(data);
