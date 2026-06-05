import fs from 'node:fs/promises';
import path from 'node:path';
import { ApifyClient } from 'apify-client';
import { Client as GoogleClient } from '@googlemaps/google-maps-services-js';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/tiktok');

// Chicago metro cities — TikTok rows are only kept if Google Maps confirms
// the matched business sits in one of these. Mirrors the catering scope.
const CHICAGO_METRO_CITIES = new Set([
  'chicago',
  'skokie',
  'niles',
  'morton grove',
  'lincolnwood',
  'schaumburg',
  'hoffman estates',
  'palatine',
  'mount prospect',
  'naperville',
  'aurora',
  'lombard',
  'westmont',
  'lisle',
  'oak brook',
  'wood dale',
  'bartlett',
  'bridgeview',
  'orland park',
  'tinley park',
  'burbank',
  'bolingbrook',
  'champaign',
  'urbana',
  'bloomington',
  'normal',
  'springfield',
  'peoria',
]);

// Per-category TikTok search queries (mirrors the IG hashtag list but uses
// text search since TikTok's hashtag ecosystem is thinner for niche verticals).
const QUERIES_BY_CATEGORY: Record<string, string[]> = {
  carts: ['chicago chai cart', 'chicago paan cart', 'chicago kulfi cart'],
  mehndi: ['chicago mehndi artist', 'chicago henna artist'],
  hair_makeup: [
    'chicago desi bridal makeup',
    'chicago shaadi makeup',
    'chicago arab bridal makeup',
    'chicago muslim bridal makeup',
  ],
  dj: ['chicago shaadi dj', 'chicago arab dj'],
  decor: ['chicago shaadi decor', 'chicago arab wedding decor'],
  photography: [
    'chicago desi wedding photographer',
    'chicago shaadi photographer',
    'chicago arab wedding photographer',
    'chicago lebanese wedding photographer',
  ],
  videography: [
    'chicago desi wedding videographer',
    'chicago shaadi videographer',
    'chicago arab wedding videographer',
  ],
  venue: ['chicago shaadi venue', 'chicago desi wedding venue', 'chicago arab wedding venue'],
  live_music: ['chicago dhol player', 'chicago baraat', 'chicago zaffa'],
};

interface AddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

function extractCity(components?: AddressComponent[]): string | undefined {
  return components?.find((c) => c.types?.includes('locality'))?.long_name;
}

function extractPostal(components?: AddressComponent[]): string | undefined {
  return components?.find((c) => c.types?.includes('postal_code'))?.long_name;
}

function normalizeTikTokHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  return input.replace(/^@/, '').trim().toLowerCase() || null;
}

/** For a TikTok-discovered business, look it up on Google Maps. If a top
 *  result exists AND its locality is in our Chicago metro set, return the
 *  enrichment payload. Otherwise return null — the caller drops the row. */
async function lookupOnGoogleMaps(
  business_name: string,
  google: GoogleClient,
  apiKey: string
): Promise<{
  city: string;
  postal: string | undefined;
  lat: number | undefined;
  lng: number | undefined;
  phone: string | undefined;
  website: string | undefined;
  photo_urls: string[];
  place_id: string;
} | null> {
  try {
    const resp = await google.textSearch({
      params: { query: `${business_name} Chicago IL`, key: apiKey, region: 'us' },
      timeout: 10_000,
    });
    const top = resp.data.results[0];
    if (!top?.place_id) return null;

    const details = await google.placeDetails({
      params: {
        place_id: top.place_id,
        key: apiKey,
        fields: [
          'name',
          'formatted_phone_number',
          'website',
          'geometry',
          'photos',
          'address_components',
        ],
      },
      timeout: 10_000,
    });
    const d = details.data.result;
    const components = d.address_components as AddressComponent[] | undefined;
    const city = extractCity(components);
    if (!city || !CHICAGO_METRO_CITIES.has(city.toLowerCase())) {
      // Not actually in our Chicago metro coverage area — drop.
      return null;
    }

    return {
      city,
      postal: extractPostal(components),
      lat: d.geometry?.location?.lat,
      lng: d.geometry?.location?.lng,
      phone: d.formatted_phone_number ?? undefined,
      website: d.website ?? undefined,
      photo_urls: (d.photos ?? [])
        .slice(0, 5)
        .map(
          (p) =>
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${apiKey}`
        ),
      place_id: top.place_id,
    };
  } catch {
    return null;
  }
}

export async function runTiktokSearchLayer(): Promise<void> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) throw new Error('APIFY_API_TOKEN required');
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleKey)
    throw new Error('GOOGLE_MAPS_API_KEY required (server-side, for photo enrichment)');

  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('tiktok', runDate);
  const apify = new ApifyClient({ token: apifyToken });
  const google = new GoogleClient({});

  const rows: ScrapedRow[] = [];
  let droppedNoMatch = 0;
  const droppedOutsideMetro = 0;

  for (const [category, queries] of Object.entries(QUERIES_BY_CATEGORY)) {
    for (const query of queries) {
      manifest.queries_executed += 1;
      try {
        // clockworks/tiktok-scraper is the canonical community actor; there's
        // no dedicated "search" actor. Search runs return video items with
        // creator info under `authorMeta`.
        const run = await apify.actor('clockworks/tiktok-scraper').call({
          searchQueries: [query],
          resultsPerPage: 30,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        });
        const { items } = await apify.dataset(run.defaultDatasetId).listItems();

        // Dedup videos by creator handle within a single query — the same
        // creator can show up many times in one search.
        const seenInQuery = new Set<string>();
        for (const raw of items) {
          const item = raw as Record<string, unknown>;
          const author = (item.authorMeta as Record<string, unknown> | undefined) ?? {};
          const handle = normalizeTikTokHandle(
            (author.name as string) ??
              (author.nickName as string) ??
              (item.authorUserName as string) ??
              null
          );
          if (!handle || seenInQuery.has(handle)) continue;
          seenInQuery.add(handle);
          const businessName = (
            (author.nickName as string) ||
            (author.name as string) ||
            handle
          ).trim();
          const bio = (author.signature as string) ?? undefined;

          // Now ask Google Maps. This is BOTH the location filter and the
          // photo enrichment. Loose-match: take the top result.
          const enrichment = await lookupOnGoogleMaps(businessName, google, googleKey);
          if (!enrichment) {
            droppedNoMatch += 1;
            continue;
          }

          rows.push({
            source: 'tiktok',
            source_external_id: handle,
            business_name: businessName,
            category,
            tags: [`tiktok_query:${query}`],
            city: enrichment.city,
            state: 'IL',
            postal_code: enrichment.postal,
            lat: enrichment.lat,
            lng: enrichment.lng,
            phone: enrichment.phone,
            website: enrichment.website,
            tiktok_handle: handle,
            bio,
            photos: enrichment.photo_urls,
            raw: { tiktok: item, google_place_id: enrichment.place_id },
          });
        }
      } catch (e) {
        manifest.errors.push({
          context: `query=${query}`,
          code: 'TIKTOK_ERROR',
          message: e instanceof Error ? e.message : String(e),
          ts: new Date().toISOString(),
        });
      }
    }
  }

  manifest.records_returned = rows.length;
  manifest.notes = `tiktok search; dropped ${droppedNoMatch} (no Google match), ${droppedOutsideMetro} (outside Chicago metro)`;
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(
    `tiktok: ${rows.length} rows kept (after Chicago-metro filter); ${droppedNoMatch} TikTok rows had no Google Maps match`
  );
}

if (require.main === module) {
  runTiktokSearchLayer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
