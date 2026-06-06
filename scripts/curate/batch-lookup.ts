import fs from 'node:fs/promises';
import path from 'node:path';
import { Client as GoogleClient } from '@googlemaps/google-maps-services-js';

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

interface InputRow {
  identifier: string;
  category: Category | '';
}

interface ReviewRow {
  identifier: string;
  category: Category | '';
  resolved_name: string;
  city: string;
  state: string;
  phone: string;
  website: string;
  instagram: string;
  photos_count: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  status: 'KEEP' | 'SKIP' | '';
  notes: string;
  place_id: string;
}

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

function escapeCsvCell(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function readInput(rows: string[][]): InputRow[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idIdx = header.indexOf('identifier');
  const catIdx = header.indexOf('category');
  if (idIdx === -1) {
    throw new Error('input CSV must have an "identifier" column');
  }
  const out: InputRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const identifier = (row[idIdx] ?? '').trim();
    if (!identifier) continue;
    const rawCat = catIdx === -1 ? '' : (row[catIdx] ?? '').trim().toLowerCase();
    const category =
      rawCat && (CATEGORIES as readonly string[]).includes(rawCat) ? (rawCat as Category) : '';
    if (rawCat && !category) {
      console.error(
        `row ${r + 1}: invalid category "${rawCat}", leaving blank. Valid: ${CATEGORIES.join(', ')}`
      );
    }
    out.push({ identifier, category });
  }
  return out;
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

function instagramWebsiteHandle(website: string): string {
  if (!website) return '';
  const m = website.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase().replace(/\/$/, '') : '';
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Confidence is a rough name-match signal between the input identifier and
 *  the resolved Google Place name. Reviewers should re-check `low` matches. */
function scoreConfidence(input: string, resolved: string): 'high' | 'medium' | 'low' {
  const inputTokens = new Set(
    normalize(input)
      .split(' ')
      .filter((t) => t.length >= 3)
  );
  const resolvedTokens = new Set(
    normalize(resolved)
      .split(' ')
      .filter((t) => t.length >= 3)
  );
  if (inputTokens.size === 0) return 'low';
  let overlap = 0;
  inputTokens.forEach((t) => {
    if (resolvedTokens.has(t)) overlap += 1;
  });
  const ratio = overlap / inputTokens.size;
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'medium';
  return 'low';
}

async function lookupOne(
  input: InputRow,
  google: GoogleClient,
  apiKey: string
): Promise<ReviewRow> {
  const blank: ReviewRow = {
    identifier: input.identifier,
    category: input.category,
    resolved_name: '',
    city: '',
    state: '',
    phone: '',
    website: '',
    instagram: '',
    photos_count: 0,
    confidence: 'none',
    status: '',
    notes: '',
    place_id: '',
  };

  let id = input.identifier.trim();
  let placeIdFromUrl: string | null = null;

  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)/.test(id)) {
    id = await unfurlShortUrl(id);
  }
  if (/^https?:\/\/.*\.google\.com/.test(id)) {
    placeIdFromUrl = extractPlaceIdFromUrl(id);
    if (!placeIdFromUrl) {
      const titleGuess = decodeURIComponent(id.match(/\/place\/([^/]+)/)?.[1] ?? '').replace(
        /\+/g,
        ' '
      );
      if (titleGuess) id = titleGuess;
    }
  }

  let placeId = placeIdFromUrl;
  if (!placeId) {
    const igHandle = extractIgHandle(id);
    const query = igHandle ? `${igHandle} Chicago IL` : `${id} Chicago IL`;
    try {
      const resp = await google.textSearch({
        params: { query, key: apiKey, region: 'us' },
        timeout: 10_000,
      });
      const top = resp.data.results[0];
      if (top?.place_id) placeId = top.place_id;
    } catch (e) {
      blank.notes = `text-search error: ${e instanceof Error ? e.message : String(e)}`;
      return blank;
    }
  }

  if (!placeId) {
    blank.notes = 'no Google Maps match';
    return blank;
  }

  try {
    const details = await google.placeDetails({
      params: {
        place_id: placeId,
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
    const city = components?.find((c) => c.types?.includes('locality'))?.long_name ?? '';
    const state =
      components?.find((c) => c.types?.includes('administrative_area_level_1'))?.short_name ?? '';
    const website = d.website ?? '';
    const websiteIg = instagramWebsiteHandle(website);
    const inputIg = extractIgHandle(input.identifier) ?? '';
    const ig = websiteIg || inputIg;
    const name = d.name ?? '';

    return {
      identifier: input.identifier,
      category: input.category,
      resolved_name: name,
      city,
      state,
      phone: d.formatted_phone_number ?? '',
      website,
      instagram: ig,
      photos_count: (d.photos ?? []).length,
      confidence: scoreConfidence(input.identifier, name),
      status: '',
      notes: '',
      place_id: placeId,
    };
  } catch (e) {
    blank.notes = `place-details error: ${e instanceof Error ? e.message : String(e)}`;
    blank.place_id = placeId;
    return blank;
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('usage: tsx scripts/curate/batch-lookup.ts <input.csv>');
    console.error('  writes a sibling <input>.review.csv with the lookup results');
    process.exit(1);
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY required');

  const text = await fs.readFile(inputPath, 'utf8');
  const inputs = readInput(parseCsv(text));
  if (inputs.length === 0) {
    console.error('no rows to process');
    process.exit(1);
  }

  const google = new GoogleClient({});
  const reviewPath = inputPath.replace(/\.csv$/, '') + '.review.csv';
  const results: ReviewRow[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const r = inputs[i];
    process.stderr.write(`[${i + 1}/${inputs.length}] ${r.identifier} ... `);
    const review = await lookupOne(r, google, apiKey);
    results.push(review);
    process.stderr.write(
      `${review.resolved_name || '(no match)'} [${review.confidence}${review.notes ? ' — ' + review.notes : ''}]\n`
    );
  }

  const header = [
    'identifier',
    'category',
    'resolved_name',
    'city',
    'state',
    'phone',
    'website',
    'instagram',
    'photos_count',
    'confidence',
    'status',
    'notes',
    'place_id',
  ];
  const lines = [header.join(',')];
  for (const r of results) {
    lines.push(
      [
        r.identifier,
        r.category,
        r.resolved_name,
        r.city,
        r.state,
        r.phone,
        r.website,
        r.instagram,
        r.photos_count,
        r.confidence,
        r.status,
        r.notes,
        r.place_id,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  await fs.writeFile(reviewPath, lines.join('\n') + '\n');

  const counts = {
    total: results.length,
    high: results.filter((r) => r.confidence === 'high').length,
    medium: results.filter((r) => r.confidence === 'medium').length,
    low: results.filter((r) => r.confidence === 'low').length,
    none: results.filter((r) => r.confidence === 'none').length,
  };
  console.log(`\nReview written to ${reviewPath}`);
  console.log(
    `  ${counts.total} rows: ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.none} no-match`
  );
  console.log(`Next: edit ${path.basename(reviewPath)}, set status=KEEP|SKIP per row, then run`);
  console.log(`  npm run curate:batch-insert -- ${reviewPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
