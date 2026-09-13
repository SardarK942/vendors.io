import OpenAI from 'openai';

// Lazily construct the client so this module can be imported without an API key
// present (e.g. unit-testing the pure buildVendorEmbeddingText below). The SDK
// throws in its constructor when no key is set, which would otherwise make every
// importer of this file require OPENAI_API_KEY just to load.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

export interface VendorEmbeddingInput {
  business_name: string;
  category: string | null;
  bio?: string | null;
  subcategories?: string[] | null;
  services?: string[] | null;
  service_area?: string[] | null;
  base_city?: string | null;
  languages?: string[] | null;
  served_event_types?: string[] | null;
  years_in_business?: number | null;
}

/**
 * Canonical text a vendor is embedded from. Used by BOTH the hourly cron and
 * the admin embed route so every vendor's vector is built from the same shape.
 * Widened beyond name+category+bio to include the structured facets that user
 * queries actually mention (service area, languages, event types, specialties).
 * Empty/null fields are dropped entirely — no stray labels, no "null".
 */
export function buildVendorEmbeddingText(vendor: VendorEmbeddingInput): string {
  const lines: string[] = [];
  const list = (arr: string[] | null | undefined) => (arr ?? []).filter(Boolean);

  const specialties = list(vendor.subcategories);
  lines.push([vendor.business_name, vendor.category].filter(Boolean).join(' — '));
  if (specialties.length) lines.push(`Specialties: ${specialties.join(', ')}`);

  const services = list(vendor.services);
  if (services.length) lines.push(`Services: ${services.join(', ')}`);

  const areas = list(vendor.service_area);
  const places = [vendor.base_city, ...areas].filter(Boolean) as string[];
  if (places.length) lines.push(`Serves: ${Array.from(new Set(places)).join(', ')}`);

  const languages = list(vendor.languages);
  if (languages.length) lines.push(`Languages: ${languages.join(', ')}`);

  const events = list(vendor.served_event_types);
  if (events.length) lines.push(`Event types: ${events.join(', ')}`);

  if (typeof vendor.years_in_business === 'number' && vendor.years_in_business > 0) {
    lines.push(`${vendor.years_in_business} years in business`);
  }

  if (vendor.bio) lines.push(vendor.bio);

  return lines.join('\n').trim();
}

/**
 * The vendor_profiles columns buildVendorEmbeddingText() reads. This list is the
 * single source of truth for "what feeds the vector" — keep it in lockstep with
 * the function above so embedding invalidation can't silently drift from what the
 * embedding actually encodes.
 */
export const EMBEDDING_SOURCE_FIELDS = [
  'business_name',
  'category',
  'subcategories',
  'services',
  'service_area',
  'base_city',
  'languages',
  'served_event_types',
  'years_in_business',
  'bio',
] as const;

/**
 * Stale-embedding guard for vendor_profiles UPDATE/INSERT payloads.
 *
 * Embeddings are write-once (the hourly cron only fills `embedding IS NULL`), so
 * a vendor who edits their bio/category/etc. after being embedded would keep a
 * vector built from the OLD text forever — the search would rank them on content
 * they no longer have. To prevent that, any write that changes an embedding-source
 * field also nulls `embedding`, which puts the row back in the cron's queue for a
 * fresh vector within the hour. Writes that touch no source field (pause toggle,
 * instagram handle, portfolio images) are returned unchanged — no needless churn.
 */
export function invalidateEmbeddingOnContentChange<T extends Record<string, unknown>>(
  payload: T
): T | (T & { embedding: null }) {
  const touchesSource = EMBEDDING_SOURCE_FIELDS.some((field) => field in payload);
  return touchesSource ? { ...payload, embedding: null } : payload;
}

/**
 * Generate an embedding vector for a given text using text-embedding-3-small.
 * Cost: ~$0.00002 per 1K tokens ($1 per 50M tokens).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // Cap input to avoid token limit
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a batch.
 * More efficient than individual calls for bulk operations.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: texts.map((t) => t.slice(0, 8000)),
  });

  return response.data.map((d) => d.embedding);
}
