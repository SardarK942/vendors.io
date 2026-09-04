/**
 * Re-embed every active vendor with the enriched embedding text. Run once after
 * buildVendorEmbeddingText changes shape — existing vectors are otherwise stale.
 *
 * Usage (dev):   npm run ai:reembed
 * Usage (prod):  point NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY at
 *                prod and re-run (user does this).
 * Requires OPENAI_API_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { generateEmbeddingsBatch, buildVendorEmbeddingText } from '@/lib/ai/embeddings';

const CHUNK = 100;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const supabase = createClient<Database>(url, key);

  const { data: vendors, error } = await supabase
    .from('vendor_profiles')
    .select(
      'id, business_name, bio, category, subcategories, services, service_area, base_city, languages, served_event_types, years_in_business'
    )
    .eq('is_active', true);
  if (error) throw error;
  if (!vendors?.length) {
    console.log('No active vendors.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < vendors.length; i += CHUNK) {
    const batch = vendors.slice(i, i + CHUNK);
    const embeddings = await generateEmbeddingsBatch(batch.map((v) => buildVendorEmbeddingText(v)));
    for (let j = 0; j < batch.length; j++) {
      const { error: upErr } = await supabase
        .from('vendor_profiles')
        .update({ embedding: JSON.stringify(embeddings[j]) } as Record<string, unknown>)
        .eq('id', batch[j].id);
      if (upErr) console.error(`  ${batch[j].id}: ${upErr.message}`);
      else updated++;
    }
    console.log(`Re-embedded ${Math.min(i + CHUNK, vendors.length)}/${vendors.length}`);
  }
  console.log(`Done. Updated ${updated}/${vendors.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
