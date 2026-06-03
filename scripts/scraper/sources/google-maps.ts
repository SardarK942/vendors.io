import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@googlemaps/google-maps-services-js';
import { createRateLimiter } from '../lib/rate-limit';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { CHICAGO_METRO_LOCALES, CATEGORY_TO_PLACES_QUERY } from '../data/chicago-locales';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/google-maps');

interface AddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

function extractCity(components?: AddressComponent[]): string | undefined {
  return components?.find((c) => c.types?.includes('locality'))?.long_name;
}

function extractZip(components?: AddressComponent[]): string | undefined {
  return components?.find((c) => c.types?.includes('postal_code'))?.long_name;
}

export async function runGoogleMapsSource(
  opts: { categories?: string[]; locales?: string[] } = {}
): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey)
    throw new Error('GOOGLE_MAPS_API_KEY required (server-side key, no referrer restriction)');

  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('google_maps', runDate);

  const client = new Client({});
  const limiter = createRateLimiter({ qps: 10, burst: 5, jitterMs: 50 });

  const categories = opts.categories ?? Object.keys(CATEGORY_TO_PLACES_QUERY);
  const locales = opts.locales ?? CHICAGO_METRO_LOCALES;
  const allRows: ScrapedRow[] = [];

  for (const category of categories) {
    const queries = CATEGORY_TO_PLACES_QUERY[category] ?? [];
    const categoryRows: ScrapedRow[] = [];

    for (const locale of locales) {
      for (const baseQuery of queries) {
        const query = `${baseQuery} in ${locale}`;
        await limiter.acquire();
        manifest.queries_executed += 1;
        try {
          const resp = await client.textSearch({
            params: { query, key: apiKey, region: 'us' },
            timeout: 10_000,
          });
          for (const place of resp.data.results) {
            if (!place.place_id) continue;
            await limiter.acquire();
            const details = await client.placeDetails({
              params: {
                place_id: place.place_id,
                key: apiKey,
                fields: [
                  'name',
                  'formatted_address',
                  'formatted_phone_number',
                  'website',
                  'geometry',
                  'photos',
                  'types',
                  'address_components',
                ],
              },
              timeout: 10_000,
            });
            const d = details.data.result;
            const components = d.address_components as AddressComponent[] | undefined;
            categoryRows.push({
              source: 'google_maps',
              source_external_id: place.place_id,
              business_name: d.name ?? place.name ?? 'unknown',
              category,
              tags: [],
              city: extractCity(components),
              state: 'IL',
              postal_code: extractZip(components),
              lat: d.geometry?.location?.lat,
              lng: d.geometry?.location?.lng,
              phone: d.formatted_phone_number ?? undefined,
              website: d.website ?? undefined,
              photos: (d.photos ?? [])
                .slice(0, 5)
                .map(
                  (p) =>
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${apiKey}`
                ),
              raw: { textSearch: place, details: d } as Record<string, unknown>,
            });
          }
        } catch (e) {
          manifest.errors.push({
            context: query,
            code: 'PLACES_ERROR',
            message: e instanceof Error ? e.message : String(e),
            ts: new Date().toISOString(),
          });
        }
      }
    }

    const filename = path.join(outDir, `${category}.json`);
    await fs.writeFile(filename, JSON.stringify(categoryRows, null, 2));
    manifest.records_returned += categoryRows.length;
    allRows.push(...categoryRows);
    console.log(`google-maps: category=${category} wrote ${categoryRows.length} rows`);
  }

  // Combined rows.json for merge.ts to pick up
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(allRows, null, 2));
  await writeManifest(outDir, manifest);
}

if (require.main === module) {
  runGoogleMapsSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
