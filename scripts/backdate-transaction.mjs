// Backdate a transaction's created_at by N hours so the 24h-grace cron picks
// it up. Service-role bypass; intended for smoke-test acceleration only.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const txId = process.argv[2];
const hours = parseInt(process.argv[3] ?? '25', 10);
if (!txId) { console.error('usage: node scripts/backdate-transaction.mjs <transaction_id> [hours=25]'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const newCreated = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const { data, error } = await sb.from('transactions').update({ created_at: newCreated }).eq('id', txId).select();
if (error) { console.error(error); process.exit(1); }
if (!data?.length) { console.error('No transaction matched id:', txId); process.exit(1); }
console.log(`Backdated tx ${txId} created_at → ${newCreated} (${hours}h ago)`);
console.log(data[0]);
