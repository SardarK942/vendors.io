/**
 * Remove the AI-search eval seed from the DEV database (slug prefix `eval-`
 * + the seed auth user). Run this after measuring — the seed is TRANSIENT and
 * must not persist, because the e2e suite runs against the same dev DB and
 * extra active vendors crowd test-created vendors off the first page of
 * /vendors (20/page), breaking marketplace-visibility specs.
 *
 * Idempotent. SAFETY: refuses to run against the prod project ref.
 *
 * Usage (dev):  npm run ai:eval-cleanup
 * Requires NEXT_PUBLIC_SUPABASE_URL (dev) + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const PROD_REF = 'obpdgihdskbxzgyctaib';
const SEED_EMAIL = 'ai-eval-seed@e2e-test.baazar.io.local';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (url.includes(PROD_REF)) {
    throw new Error('Refusing to run against the prod project.');
  }
  const supabase = createClient<Database>(url, key);

  const { error: delErr } = await supabase.from('vendor_profiles').delete().like('slug', 'eval-%');
  if (delErr) throw delErr;

  const { data: existing } = await supabase.auth.admin.listUsers();
  const seedUser = existing?.users.find((u) => u.email === SEED_EMAIL);
  if (seedUser) await supabase.auth.admin.deleteUser(seedUser.id);

  console.log(`Cleaned eval seed (vendors + ${seedUser ? '1 seed user' : 'no seed user'}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
