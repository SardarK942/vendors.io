// Inspect bookings + transactions for a vendor (by email).
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const vendorEmail = process.argv[2];
if (!vendorEmail) { console.error('usage: node scripts/inspect-booking.mjs <vendor-email>'); process.exit(1); }

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const vendor = list.users.find(u => u.email?.toLowerCase() === vendorEmail.toLowerCase());
if (!vendor) { console.log('vendor not found'); process.exit(0); }

const { data: vp } = await sb.from('vendor_profiles').select('*').eq('user_id', vendor.id).maybeSingle();
if (!vp) { console.log('vendor_profile not found'); process.exit(0); }

console.log(`Vendor: ${vp.business_name} (${vp.id})`);

const { data: bookings } = await sb.from('booking_requests').select('*').eq('vendor_profile_id', vp.id).order('created_at', { ascending: false });
console.log(`\nbooking_requests (${bookings?.length ?? 0}):`);
for (const b of bookings ?? []) {
  console.log(`\n  id=${b.id}`);
  console.log(`  status=${b.status}  event_type=${b.event_type}  event_date=${b.event_date}`);
  console.log(`  vendor_quote_amount=${b.vendor_quote_amount}  deposit_amount=${b.deposit_amount}`);
  console.log(`  created=${b.created_at}  updated=${b.updated_at}`);

  const { data: txs } = await sb.from('transactions').select('*').eq('booking_request_id', b.id);
  console.log(`  transactions (${txs?.length ?? 0}):`);
  for (const t of txs ?? []) {
    console.log(`    id=${t.id}`);
    console.log(`    status=${t.status}  total=${t.amount_total}  platform=${t.platform_cut}  vendor_pending=${t.vendor_payout}`);
    console.log(`    stripe_payment_intent=${t.stripe_payment_intent_id}`);
    console.log(`    stripe_transfer_id=${t.stripe_transfer_id ?? '(none)'}`);
    console.log(`    transferred_at=${t.transferred_at ?? '(none)'}  refunded_at=${t.refunded_at ?? '(none)'}`);
    console.log(`    platform_recognized_at=${t.platform_recognized_at ?? '(none)'}`);
  }
}

const { data: sa } = await sb.from('stripe_accounts').select('*').eq('vendor_profile_id', vp.id).maybeSingle();
console.log(`\nstripe_accounts:`);
console.log(`  account_id=${sa?.stripe_account_id}  charges_enabled=${sa?.charges_enabled}  payouts_enabled=${sa?.payouts_enabled}`);
console.log(`  onboarding_complete=${sa?.onboarding_complete}  details_submitted_at=${sa?.details_submitted_at ?? '(none)'}`);
console.log(`  frozen_reason=${sa?.frozen_reason ?? '(none)'}`);
