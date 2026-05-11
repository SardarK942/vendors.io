// One-off: manually unlock a transaction (recognized/authorized → earned) when
// the on_booking_completed trigger failed to fire. Smoke-test recovery only.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const txId = process.argv[2];
if (!txId) { console.error('usage: node scripts/manual-unlock-transaction.mjs <transaction_id>'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const now = new Date().toISOString();
const { data: existing } = await sb.from('transactions').select('platform_fee_recognized_at').eq('id', txId).maybeSingle();

const { data, error } = await sb.from('transactions').update({
  status: 'earned',
  vendor_earned_at: now,
  platform_fee_recognized_at: existing?.platform_fee_recognized_at ?? now,
}).eq('id', txId).select();

if (error) { console.error(error); process.exit(1); }
console.log('Updated:', data);
