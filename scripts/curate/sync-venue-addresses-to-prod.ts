/**
 * Sync the backfilled street address + ZIP (and the captured place id, stored in
 * `raw`) from the finalized dev venue rows to their matching PROD rows, by slug.
 * Run after `scripts/curate/promote-venues-to-prod.ts`, once the dev rows have
 * been address-backfilled. Idempotent.
 *
 * Run it yourself (prod writes are user-applied):
 *   npx tsx --env-file-if-exists=.env.local scripts/curate/sync-venue-addresses-to-prod.ts
 *
 * Reads the ACTIVE (dev) creds from .env.local and the PROD creds from the
 * commented `# NEXT_PUBLIC_SUPABASE_URL=` / `# SUPABASE_SERVICE_ROLE_KEY=` lines.
 *
 * NOTE: for the pre-filled street to actually land on a claimed profile, the
 * prod deployment must already include the promote change that copies
 * raw.address_line_1 -> base_address_line_1 (merge that PR first).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

type RawObj = Record<string, unknown>;
interface DevVenueRow {
  slug: string;
  postal_code: string | null;
  raw: RawObj | null;
  tags: string[] | null;
}

const envText = fs.readFileSync('.env.local', 'utf8');
function commented(key: string): string {
  const m = envText.match(new RegExp(`^#\\s*${key}=(.+)$`, 'm'));
  if (!m) throw new Error(`commented ${key} not found in .env.local`);
  return m[1].trim();
}
const dev = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const prod = createClient(
  commented('NEXT_PUBLIC_SUPABASE_URL'),
  commented('SUPABASE_SERVICE_ROLE_KEY')
);

async function main() {
  const { data, error } = await dev
    .from('scraped_vendors')
    .select('slug, postal_code, raw, tags, scraped_at')
    .eq('category', 'venue')
    .eq('source', 'hand_curated')
    .is('claimed_at', null)
    .order('scraped_at', { ascending: true });
  if (error) throw error;
  const venues = ((data ?? []) as DevVenueRow[]).filter(
    (v) => !(v.tags ?? []).includes('__venue_test__')
  );
  console.log(`dev venues to sync: ${venues.length}`);

  let synced = 0,
    missing = 0;
  for (const v of venues) {
    const { data: prodRow } = await prod
      .from('scraped_vendors')
      .select('id, raw')
      .eq('slug', v.slug)
      .maybeSingle<{ id: string; raw: RawObj | null }>();
    if (!prodRow) {
      console.log(`  ? not in prod: ${v.slug}`);
      missing++;
      continue;
    }
    const mergedRaw: RawObj = { ...(prodRow.raw ?? {}), ...(v.raw ?? {}) };
    const { error: upErr } = await prod
      .from('scraped_vendors')
      .update({ postal_code: v.postal_code, raw: mergedRaw })
      .eq('id', prodRow.id);
    if (upErr) {
      console.log(`  ! ERR ${v.slug}: ${upErr.message}`);
      continue;
    }
    const street = typeof v.raw?.address_line_1 === 'string' ? v.raw.address_line_1 : '(no street)';
    console.log(`  ~ ${v.slug}  (${street}, ZIP ${v.postal_code ?? '-'})`);
    synced++;
  }
  console.log(`\nPROD synced: ${synced}${missing ? `, missing: ${missing}` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
