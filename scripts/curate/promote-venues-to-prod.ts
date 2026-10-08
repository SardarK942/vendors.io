/**
 * Promote the finalized hand-curated VENUE listings from dev → prod, then mint
 * claim links for them and write a mail-merge CSV. Idempotent: re-running skips
 * venues already in prod and venues that already have a claim token.
 *
 * Run it yourself (prod writes are intentionally user-applied):
 *   npx tsx --env-file-if-exists=.env.local scripts/curate/promote-venues-to-prod.ts
 *
 * Reads the ACTIVE (dev) creds from .env.local, and the PROD creds from the
 * commented `# NEXT_PUBLIC_SUPABASE_URL=` / `# SUPABASE_SERVICE_ROLE_KEY=` lines
 * in the same file. Claim links use CLAIM_APP_URL (default https://www.baazar.io).
 *
 * Optional env:
 *   CAMPAIGN=venues-2026-10     label stored on each token + in the CSV
 *   TTL_DAYS=90                 link lifetime
 *   CLAIM_APP_URL=https://www.baazar.io
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { mintTokenString, hashTokenString } from '../scraper/lib/claim-token';

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

const CAMPAIGN = process.env.CAMPAIGN ?? 'venues-2026-10';
const TTL_DAYS = Number(process.env.TTL_DAYS ?? '90');
const APP_URL = (process.env.CLAIM_APP_URL ?? 'https://www.baazar.io').replace(/\/$/, '');

const COLS =
  'source, source_external_id, business_name, category, tags, city, state, postal_code, lat, lng, phone, email, website, instagram_handle, facebook_url, bio, photos, raw, slug, review_status';

interface ScrapedRow {
  slug: string;
  business_name: string;
  instagram_handle: string | null;
  photos: string[];
  tags: string[] | null;
  [k: string]: unknown;
}

async function main() {
  // 1. Finalized venues in dev
  const { data: rows, error } = await dev
    .from('scraped_vendors')
    .select(COLS)
    .eq('category', 'venue')
    .eq('source', 'hand_curated')
    .is('claimed_at', null)
    .order('scraped_at', { ascending: true });
  if (error) throw error;
  const venues = ((rows ?? []) as ScrapedRow[]).filter(
    (v) => !(v.tags ?? []).includes('__venue_test__')
  );
  console.log(`dev finalized venues: ${venues.length}`);

  // 2. Copy to prod (idempotent by slug) → collect prod rows
  const prodVenues: Array<{
    id: string;
    business_name: string;
    instagram_handle: string | null;
    slug: string;
  }> = [];
  for (const v of venues) {
    const { data: exists } = await prod
      .from('scraped_vendors')
      .select('id')
      .eq('slug', v.slug)
      .maybeSingle();
    if (exists) {
      console.log(`  = exists ${v.slug}`);
      prodVenues.push({
        id: exists.id,
        business_name: v.business_name,
        instagram_handle: v.instagram_handle,
        slug: v.slug,
      });
      continue;
    }
    const { data: ins, error: insErr } = await prod
      .from('scraped_vendors')
      .insert(v)
      .select('id')
      .single();
    if (insErr || !ins) {
      console.log(`  ! ERR insert ${v.slug}: ${insErr?.message}`);
      continue;
    }
    console.log(`  + ${v.slug} (${v.photos.length} photos)`);
    prodVenues.push({
      id: ins.id,
      business_name: v.business_name,
      instagram_handle: v.instagram_handle,
      slug: v.slug,
    });
  }

  // 3. Mint a claim token per prod venue (idempotent: skip if one exists)
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000).toISOString();
  const csv = ['scraped_vendor_id,business_name,instagram_handle,claim_url,campaign'];
  let minted = 0,
    hadToken = 0;
  for (const v of prodVenues) {
    const { data: existingTok } = await prod
      .from('claim_tokens')
      .select('id')
      .eq('scraped_vendor_id', v.id)
      .is('claimed_at', null)
      .is('revoked_at', null)
      .maybeSingle();
    if (existingTok) {
      console.log(
        `  = token exists ${v.slug} (not re-minted; re-run after revoking if you need a fresh link)`
      );
      hadToken++;
      continue;
    }
    const token = mintTokenString(v.id);
    const { error: tErr } = await prod.from('claim_tokens').insert({
      scraped_vendor_id: v.id,
      token_hash: hashTokenString(token),
      expires_at: expiresAt,
      campaign_label: CAMPAIGN,
    });
    if (tErr) {
      console.log(`  ! ERR token ${v.slug}: ${tErr.message}`);
      continue;
    }
    csv.push(
      [
        v.id,
        JSON.stringify(v.business_name),
        v.instagram_handle ?? '',
        `${APP_URL}/claim/${token}`,
        CAMPAIGN,
      ].join(',')
    );
    minted++;
  }

  const outFile = path.join(process.cwd(), `venues-claim-links-${CAMPAIGN}.csv`);
  fs.writeFileSync(outFile, csv.join('\n'));
  console.log(
    `\nPROD: ${prodVenues.length} venues present, ${minted} links minted (${hadToken} already had a live token).`
  );
  console.log(`Claim links CSV: ${outFile}`);
  if (hadToken > 0)
    console.log(
      `NOTE: ${hadToken} venue(s) already had a live token, so they are NOT in the CSV. Their existing link still works.`
    );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
