import fs from 'node:fs/promises';
import path from 'node:path';
import { ApifyClient } from 'apify-client';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { normalizeInstagramHandle } from '../lib/normalize';
import { HASHTAGS_BY_CATEGORY, VENUE_LOCATIONS } from '../data/instagram-targets';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/instagram');

export async function runInstagramHashtagLayer(opts: { category?: string } = {}): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN required');

  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('instagram', runDate);
  const client = new ApifyClient({ token });

  const categories = opts.category ? [opts.category] : Object.keys(HASHTAGS_BY_CATEGORY);
  const rows: ScrapedRow[] = [];

  for (const category of categories) {
    const hashtags = HASHTAGS_BY_CATEGORY[category];
    if (!hashtags) continue;

    manifest.queries_executed += 1;
    try {
      const run = await client.actor('apify/instagram-hashtag-scraper').call({
        hashtags,
        resultsLimit: 50,
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      for (const raw of items) {
        const item = raw as Record<string, unknown>;
        const handle = normalizeInstagramHandle((item.ownerUsername as string) ?? null);
        if (!handle) continue;
        rows.push({
          source: 'instagram',
          source_external_id: handle,
          business_name: (item.ownerFullName as string) ?? handle,
          category,
          tags: [`hashtag:${(item.hashtag as string) ?? ''}`],
          state: 'IL',
          instagram_handle: handle,
          bio: (item.caption as string) ?? undefined,
          photos: ((item.images as string[]) ?? [item.displayUrl as string])
            .filter((p): p is string => typeof p === 'string')
            .slice(0, 5),
          raw: item,
        });
      }
    } catch (e) {
      manifest.errors.push({
        context: `category=${category}`,
        code: 'APIFY_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned += rows.length;
  await fs.writeFile(path.join(outDir, 'hashtag-layer.json'), JSON.stringify(rows, null, 2));
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(`instagram hashtag layer: ${rows.length} rows`);
}

export async function runInstagramLocationLayer(): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN required');

  const client = new ApifyClient({ token });
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('instagram', runDate);
  manifest.notes = 'location layer';
  const rows: ScrapedRow[] = [];

  for (const venue of VENUE_LOCATIONS) {
    manifest.queries_executed += 1;
    try {
      const run = await client.actor('apify/instagram-location-scraper').call({
        searchTerm: venue,
        resultsLimit: 30,
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      for (const raw of items) {
        const item = raw as Record<string, unknown>;
        const handle = normalizeInstagramHandle((item.ownerUsername as string) ?? null);
        if (!handle) continue;
        rows.push({
          source: 'instagram',
          source_external_id: handle,
          business_name: (item.ownerFullName as string) ?? handle,
          tags: [`venue:${venue}`],
          state: 'IL',
          instagram_handle: handle,
          bio: (item.caption as string) ?? undefined,
          photos: ((item.images as string[]) ?? [item.displayUrl as string])
            .filter((p): p is string => typeof p === 'string')
            .slice(0, 5),
          raw: item,
        });
      }
    } catch (e) {
      manifest.errors.push({
        context: `venue=${venue}`,
        code: 'APIFY_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'location-layer.json'), JSON.stringify(rows, null, 2));
  await writeManifest(path.join(outDir, '_location-manifest'), manifest);
  console.log(`instagram location layer: ${rows.length} rows`);
}

if (require.main === module) {
  runInstagramHashtagLayer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
