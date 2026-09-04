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
