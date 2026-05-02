// One-off: deletes a user + all FK-cascaded rows from PROD Supabase.
// Reads PROD creds from the commented "# Supabase (prod" block in .env.local.
// Default = preview (counts only). Pass --execute to actually delete.
//
// Usage:
//   node scripts/delete-test-user.mjs <email>            # preview
//   node scripts/delete-test-user.mjs <email> --execute  # delete

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const email = process.argv[2];
const execute = process.argv.includes('--execute');
if (!email) {
  console.error('usage: node scripts/delete-test-user.mjs <email> [--execute]');
  process.exit(1);
}

const envText = fs.readFileSync('.env.local', 'utf8');
const prodSection = envText.split('# Supabase (prod')[1] ?? '';
const url = prodSection.match(/^#\s*NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const key = prodSection.match(/^#\s*SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
if (!url || !key) {
  console.error('Could not parse prod creds from .env.local commented block.');
  process.exit(1);
}

console.log(`Target:  ${url}`);
console.log(`Email:   ${email}`);
console.log(`Mode:    ${execute ? 'EXECUTE (will delete)' : 'PREVIEW (no changes)'}`);
console.log();

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) { console.error('listUsers failed:', listErr); process.exit(1); }
const user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) { console.log(`User ${email} not found in auth.users.`); process.exit(0); }
const uid = user.id;
console.log(`auth.users.id = ${uid}  created_at = ${user.created_at}`);
console.log();

const { data: profile } = await sb.from('vendor_profiles').select('id').eq('user_id', uid).maybeSingle();
const vendorProfileId = profile?.id ?? null;
console.log(`vendor_profiles.id = ${vendorProfileId ?? '(none)'}`);

const countWhere = async (table, col, val) => {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(col, val);
  if (error) return `error: ${error.message}`;
  return count ?? 0;
};

console.log();
console.log('Rows that will be cascaded by deleting auth.users row:');
console.log(`  public.users (PK = uid)                             ${await countWhere('users', 'id', uid)}`);
console.log(`  booking_requests (as couple)                        ${await countWhere('booking_requests', 'couple_user_id', uid)}`);
console.log(`  reviews (as reviewer)                               ${await countWhere('reviews', 'reviewer_user_id', uid)}`);
if (vendorProfileId) {
  console.log(`  vendor_profiles (this user's vendor row)            1`);
  console.log(`  booking_requests (as vendor)                        ${await countWhere('booking_requests', 'vendor_profile_id', vendorProfileId)}`);
  console.log(`  stripe_accounts (vendor connect row)                ${await countWhere('stripe_accounts', 'vendor_profile_id', vendorProfileId)}`);
  console.log(`  reviews (about this vendor)                         ${await countWhere('reviews', 'vendor_profile_id', vendorProfileId)}`);
} else {
  console.log(`  vendor_profiles                                     0 (no vendor row)`);
}
console.log();
console.log('Note: transactions cascade from booking_requests; not counted directly.');
console.log();

if (!execute) {
  console.log('Preview only. Re-run with --execute to actually delete.');
  process.exit(0);
}

console.log('Executing auth.admin.deleteUser…');
const { error: delErr } = await sb.auth.admin.deleteUser(uid);
if (delErr) { console.error('delete failed:', delErr); process.exit(1); }
console.log(`Deleted ${email} (${uid}). Cascaded rows are gone.`);
