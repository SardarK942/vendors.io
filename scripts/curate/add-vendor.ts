import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Client as GoogleClient } from '@googlemaps/google-maps-services-js';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { generateScrapedVendorSlug } from '../scraper/lib/slug';

const PREVIEW_PATH = '/tmp/add-vendor-preview.json';

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

interface AddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface Preview {
  business_name: string;
  category: Category | null;
  city: string | null;
  state: string;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  instagram_handle: string | null;
  bio: string | null;
  photos: string[];
  place_id: string;
  google_url: string;
  tags: string[];
}

function inferCategory(name: string, website: string | null): Category | null {
  const s = (name + ' ' + (website ?? '')).toLowerCase();
  const checks: [Category, RegExp][] = [
    ['carts', /\bcart\b|chai|paan|kulfi|dessert cart|food cart/i],
    ['mehndi', /\bmehndi|henna\b/i],
    ['photography', /\bphotograph|\bphotos\b/i],
    ['videography', /\bvideograph|cinema|films?\b/i],
    ['photobooth', /\bphoto ?booth\b/i],
    ['hair_makeup', /\bmakeup|bridal beauty|hair stylist|salon|glam\b/i],
    ['dj', /\bdj\b|disc jockey/i],
    ['catering', /\bcater|cuisine|kitchen|restaurant|biryani|tandoori\b/i],
    ['venue', /\bvenue|banquet|hall|ballroom|estate\b/i],
    ['decor', /\bdecor|floral|florist|flower|mandap\b/i],
    ['invitations', /\binvitation|stationery|cards\b/i],
    ['bridal_wear', /\bbridal wear|lehenga|saree|sari|couture|kurta\b/i],
    ['live_music', /\bdhol|dholi|band\b|baraat|zaffa|qawwali|musicians\b/i],
    ['content_creation', /\bcontent creator|content creation|reels\b/i],
  ];
  for (const [cat, re] of checks) if (re.test(s)) return cat;
  return null;
}

function extractIgHandle(input: string): string | null {
  const stripped = input.trim();
  const igUrl = stripped.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (igUrl) return igUrl[1].toLowerCase();
  if (stripped.startsWith('@')) return stripped.slice(1).toLowerCase();
  if (/^[A-Za-z0-9_.]+$/.test(stripped) && stripped.length <= 30) {
    return stripped.toLowerCase();
  }
  return null;
}

function extractPlaceIdFromUrl(url: string): string | null {
  const a = url.match(/place_id[:=]([A-Za-z0-9_-]+)/);
  if (a) return a[1];
  const b = url.match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/i);
  if (b) return b[1];
  return null;
}

async function unfurlShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.url;
  } catch {
    return url;
  }
}

function instagramWebsiteHandle(website: string | null): string | null {
  if (!website) return null;
  const m = website.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase().replace(/\/$/, '') : null;
}

async function resolveIdentifier(
  identifier: string,
  google: GoogleClient,
  apiKey: string
): Promise<{ place_id: string; searchedAs: string } | null> {
  let id = identifier.trim();
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)/.test(id)) {
    id = await unfurlShortUrl(id);
  }
  if (/^https?:\/\/.*\.google\.com/.test(id)) {
    const placeId = extractPlaceIdFromUrl(id);
    if (placeId) return { place_id: placeId, searchedAs: 'google_maps_url' };
    const titleGuess = decodeURIComponent(id.match(/\/place\/([^/]+)/)?.[1] ?? '').replace(
      /\+/g,
      ' '
    );
    if (titleGuess) id = titleGuess;
  }
  const igHandle = extractIgHandle(id);
  const query = igHandle ? `${igHandle} Chicago IL` : `${id} Chicago IL`;
  const resp = await google.textSearch({
    params: { query, key: apiKey, region: 'us' },
    timeout: 10_000,
  });
  const top = resp.data.results[0];
  if (!top?.place_id) return null;
  return { place_id: top.place_id, searchedAs: query };
}

async function buildPreview(identifier: string): Promise<Preview | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY required');
  const google = new GoogleClient({});

  const resolved = await resolveIdentifier(identifier, google, apiKey);
  if (!resolved) return null;

  const details = await google.placeDetails({
    params: {
      place_id: resolved.place_id,
      key: apiKey,
      fields: [
        'name',
        'formatted_phone_number',
        'website',
        'geometry',
        'photos',
        'address_components',
        'url',
        'editorial_summary',
      ],
    },
    timeout: 10_000,
  });
  const d = details.data.result;
  const components = d.address_components as AddressComponent[] | undefined;
  const city = components?.find((c) => c.types?.includes('locality'))?.long_name ?? null;
  const postal = components?.find((c) => c.types?.includes('postal_code'))?.long_name ?? null;
  const state =
    components?.find((c) => c.types?.includes('administrative_area_level_1'))?.short_name ?? 'IL';

  const website = d.website ?? null;
  const websiteIg = instagramWebsiteHandle(website);
  const userIg = extractIgHandle(identifier);
  const ig = websiteIg ?? userIg ?? null;

  const photos: string[] = (d.photos ?? [])
    .slice(0, 5)
    .map(
      (p) =>
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${apiKey}`
    );

  const name = d.name ?? identifier;
  const preview: Preview = {
    business_name: name,
    category: inferCategory(name, website),
    city,
    state,
    postal_code: postal,
    lat: d.geometry?.location?.lat ?? null,
    lng: d.geometry?.location?.lng ?? null,
    phone: d.formatted_phone_number ?? null,
    website,
    instagram_handle: ig,
    bio: (d as { editorial_summary?: { overview?: string } }).editorial_summary?.overview ?? null,
    photos,
    place_id: resolved.place_id,
    google_url: d.url ?? `https://www.google.com/maps/place/?q=place_id:${resolved.place_id}`,
    tags: [`hand_curated:${new Date().toISOString().slice(0, 10)}`],
  };
  return preview;
}

async function cmdLookup(identifier: string) {
  if (!identifier) throw new Error('lookup requires an identifier');
  const preview = await buildPreview(identifier);
  if (!preview) {
    console.error(`lookup: no Google Maps match for "${identifier}"`);
    process.exit(2);
  }
  await fs.writeFile(PREVIEW_PATH, JSON.stringify(preview, null, 2));
  console.log(`Preview written to ${PREVIEW_PATH}\n`);
  console.log(`  business_name: ${preview.business_name}`);
  console.log(`  category:      ${preview.category ?? '(none — supply via --category)'}`);
  console.log(`  city:          ${preview.city ?? '(unknown)'}, ${preview.state}`);
  console.log(`  phone:         ${preview.phone ?? '-'}`);
  console.log(`  website:       ${preview.website ?? '-'}`);
  console.log(`  instagram:     ${preview.instagram_handle ?? '-'}`);
  console.log(`  photos:        ${preview.photos.length}`);
  console.log(`  google_url:    ${preview.google_url}`);
}

async function cmdInsert(previewPath: string, categoryOverride: Category | null) {
  const json = await fs.readFile(previewPath, 'utf8');
  const preview = JSON.parse(json) as Preview;
  const category = categoryOverride ?? preview.category;
  if (!category) {
    throw new Error('category required — pass --category=<value> or set it in the JSON');
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error(`invalid category "${category}". Valid: ${CATEGORIES.join(', ')}`);
  }

  const id = crypto.randomUUID();
  const slug = generateScrapedVendorSlug(preview.business_name, id);
  const supabase = createServiceRoleClient();

  if (preview.instagram_handle) {
    const { data: dupe } = await supabase
      .from('scraped_vendors')
      .select('id, business_name, claimed_at, disputed_at')
      .eq('instagram_handle', preview.instagram_handle)
      .maybeSingle();
    if (dupe) {
      console.error(
        `duplicate: a scraped_vendors row already exists for @${preview.instagram_handle} (id=${dupe.id}, name="${dupe.business_name}", claimed=${!!dupe.claimed_at}, soft_deleted=${!!dupe.disputed_at}). Aborting.`
      );
      process.exit(3);
    }
  }

  const row = {
    id,
    slug,
    source: 'hand_curated' as const,
    source_external_id: preview.place_id,
    business_name: preview.business_name,
    category,
    tags: preview.tags,
    photos: preview.photos,
    city: preview.city,
    state: preview.state,
    postal_code: preview.postal_code,
    lat: preview.lat,
    lng: preview.lng,
    phone: preview.phone,
    website: preview.website,
    instagram_handle: preview.instagram_handle,
    bio: preview.bio,
    raw: { google_place_id: preview.place_id, google_url: preview.google_url },
  };
  const { error } = await supabase.from('scraped_vendors').insert(row);
  if (error) {
    console.error(`insert failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Inserted scraped_vendors row id=${id} slug=${slug}`);
  console.log(`  /vendors/${slug}`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const argMap: Record<string, string> = {};
  const positional: string[] = [];
  for (const a of rest) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) argMap[m[1]] = m[2];
    else positional.push(a);
  }

  if (cmd === 'lookup') {
    await cmdLookup(positional.join(' '));
  } else if (cmd === 'insert') {
    const path = positional[0] ?? PREVIEW_PATH;
    const cat = argMap.category as Category | undefined;
    await cmdInsert(path, cat ?? null);
  } else {
    console.error('usage:');
    console.error('  tsx scripts/curate/add-vendor.ts lookup "<name|url|@handle>"');
    console.error(
      '  tsx scripts/curate/add-vendor.ts insert [/tmp/add-vendor-preview.json] [--category=<cat>]'
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
