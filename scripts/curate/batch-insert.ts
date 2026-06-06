import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Client as GoogleClient } from '@googlemaps/google-maps-services-js';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { generateScrapedVendorSlug } from '../scraper/lib/slug';

const CATEGORIES = [
  'photography',
  'videography',
  'mehndi',
  'hair_makeup',
  'dj',
  'photobooth',
  'catering',
  'venue',
  'decor',
  'invitations',
  'bridal_wear',
  'live_music',
  'carts',
  'content_creation',
] as const;
type Category = (typeof CATEGORIES)[number];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

interface ReviewRow {
  identifier: string;
  category: string;
  resolved_name: string;
  city: string;
  state: string;
  phone: string;
  website: string;
  instagram: string;
  photos_count: string;
  confidence: string;
  status: string;
  notes: string;
  place_id: string;
}

function rowsToObjects(rows: string[][]): ReviewRow[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const required = ['identifier', 'category', 'resolved_name', 'status', 'place_id'];
  for (const f of required) {
    if (idx(f) === -1) throw new Error(`review CSV missing required column: ${f}`);
  }
  const out: ReviewRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;
    const get = (name: string) => (row[idx(name)] ?? '').trim();
    out.push({
      identifier: get('identifier'),
      category: get('category').toLowerCase(),
      resolved_name: get('resolved_name'),
      city: get('city'),
      state: get('state'),
      phone: get('phone'),
      website: get('website'),
      instagram: get('instagram').toLowerCase().replace(/^@/, ''),
      photos_count: get('photos_count'),
      confidence: get('confidence'),
      status: get('status').toUpperCase(),
      notes: get('notes'),
      place_id: get('place_id'),
    });
  }
  return out;
}

async function fetchPhotosForPlace(placeId: string, apiKey: string): Promise<string[]> {
  const google = new GoogleClient({});
  try {
    const details = await google.placeDetails({
      params: { place_id: placeId, key: apiKey, fields: ['photos'] },
      timeout: 10_000,
    });
    return (details.data.result.photos ?? [])
      .slice(0, 5)
      .map(
        (p) =>
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${apiKey}`
      );
  } catch {
    return [];
  }
}

async function main() {
  const reviewPath = process.argv[2];
  if (!reviewPath) {
    console.error('usage: tsx scripts/curate/batch-insert.ts <queue.review.csv>');
    console.error('  inserts rows where status="KEEP"');
    process.exit(1);
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY required');

  const text = await fs.readFile(reviewPath, 'utf8');
  const reviews = rowsToObjects(parseCsv(text));
  const keepers = reviews.filter((r) => r.status === 'KEEP');
  const skipped = reviews.filter((r) => r.status === 'SKIP');
  const unmarked = reviews.filter((r) => r.status !== 'KEEP' && r.status !== 'SKIP');

  console.log(`Review summary: ${reviews.length} rows`);
  console.log(`  KEEP: ${keepers.length}`);
  console.log(`  SKIP: ${skipped.length}`);
  console.log(`  unmarked: ${unmarked.length}`);
  if (unmarked.length > 0) {
    console.error(
      `\nABORT: ${unmarked.length} row(s) have no status. Mark every row as KEEP or SKIP before inserting.`
    );
    process.exit(2);
  }
  if (keepers.length === 0) {
    console.log('\nNothing to insert.');
    return;
  }

  for (const r of keepers) {
    if (!(CATEGORIES as readonly string[]).includes(r.category)) {
      console.error(
        `ABORT: row "${r.identifier}" has invalid category "${r.category}". Valid: ${CATEGORIES.join(', ')}`
      );
      process.exit(3);
    }
    if (!r.place_id) {
      console.error(`ABORT: row "${r.identifier}" has no place_id — re-run batch-lookup first.`);
      process.exit(3);
    }
  }

  const supabase = createServiceRoleClient();
  const dupeIgs = new Set<string>();
  if (keepers.some((k) => k.instagram)) {
    const igs = Array.from(new Set(keepers.map((k) => k.instagram).filter(Boolean)));
    const { data: existing } = await supabase
      .from('scraped_vendors')
      .select('instagram_handle')
      .in('instagram_handle', igs);
    for (const row of existing ?? []) {
      if (row.instagram_handle) dupeIgs.add(row.instagram_handle.toLowerCase());
    }
  }

  let inserted = 0;
  const failures: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const r of keepers) {
    if (r.instagram && dupeIgs.has(r.instagram)) {
      failures.push(`${r.identifier}: dupe IG @${r.instagram} already in scraped_vendors`);
      continue;
    }
    const photos = await fetchPhotosForPlace(r.place_id, apiKey);
    const id = crypto.randomUUID();
    const slug = generateScrapedVendorSlug(r.resolved_name || r.identifier, id);
    const row = {
      id,
      slug,
      source: 'hand_curated' as const,
      source_external_id: r.place_id,
      business_name: r.resolved_name || r.identifier,
      category: r.category as Category,
      tags: [`hand_curated:${today}`, 'batch'],
      photos,
      city: r.city || null,
      state: r.state || 'IL',
      postal_code: null,
      phone: r.phone || null,
      website: r.website || null,
      instagram_handle: r.instagram || null,
      raw: { google_place_id: r.place_id, batch_source: reviewPath },
    };
    const { error } = await supabase.from('scraped_vendors').insert(row);
    if (error) {
      failures.push(`${r.identifier}: ${error.message}`);
    } else {
      inserted += 1;
      if (r.instagram) dupeIgs.add(r.instagram);
      console.log(`  + ${slug}  (${r.category})`);
    }
  }

  console.log(`\nInserted: ${inserted}`);
  if (failures.length > 0) {
    console.log(`Failures: ${failures.length}`);
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
