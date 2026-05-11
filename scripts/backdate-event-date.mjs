// Set a booking's event_date to today (or N days ago) so couple can mark complete.
// Smoke-test acceleration only.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const bookingId = process.argv[2];
const daysAgo = parseInt(process.argv[3] ?? '0', 10);
if (!bookingId) { console.error('usage: node scripts/backdate-event-date.mjs <booking_id> [days_ago=0]'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const newDate = new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10);
const { data, error } = await sb.from('booking_requests').update({ event_date: newDate }).eq('id', bookingId).select();
if (error) { console.error(error); process.exit(1); }
if (!data?.length) { console.error('No booking matched id:', bookingId); process.exit(1); }
console.log(`Backdated booking ${bookingId} event_date → ${newDate}`);
