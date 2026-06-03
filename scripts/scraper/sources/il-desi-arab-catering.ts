import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@googlemaps/google-maps-services-js';
import { createRateLimiter } from '../lib/rate-limit';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { CHICAGO_METRO_LOCALES } from '../data/chicago-locales';
import { DESI_ARAB_CUISINES } from '../data/catering-cuisines';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/il-desi-arab-catering');

interface AddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

export async function runCateringSource(): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey)
    throw new Error('GOOGLE_MAPS_API_KEY required (server-side, no referrer restriction)');

  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('il_desi_arab_catering', runDate);
  const client = new Client({});
  const limiter = createRateLimiter({ qps: 10, burst: 5, jitterMs: 50 });
  const rows: ScrapedRow[] = [];

  for (const cuisine of DESI_ARAB_CUISINES) {
    for (const locale of CHICAGO_METRO_LOCALES) {
      const query = `${cuisine} in ${locale}`;
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
          rows.push({
            source: 'il_desi_arab_catering',
            source_external_id: place.place_id,
            business_name: d.name ?? place.name ?? 'unknown',
            category: 'catering',
            tags: [`cuisine:${cuisine}`],
            city: components?.find((c) => c.types?.includes('locality'))?.long_name,
            state: 'IL',
            postal_code: components?.find((c) => c.types?.includes('postal_code'))?.long_name,
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
            raw: { textSearch: place, details: d, catering_signal_pending: true } as Record<
              string,
              unknown
            >,
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
  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(`il-desi-arab-catering: ${rows.length} restaurants found`);
}

if (require.main === module) {
  runCateringSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
