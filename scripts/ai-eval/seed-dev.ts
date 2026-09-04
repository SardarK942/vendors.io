/**
 * Seed the DEV database with a representative set of vendors for the AI-search
 * eval harness. Each vendor's structured facts (city, languages, event types,
 * specialties) live in the columns but NOT in the bio — so the OLD embedding
 * shape (business_name + bio + category) is blind to them and the enriched
 * shape is not. That contrast is what the eval measures.
 *
 * This script embeds each vendor with the OLD shape on purpose, so the first
 * `npm run ai:eval` is a true pre-enrichment baseline. Run `npm run ai:reembed`
 * afterwards to switch to the enriched embedding, then re-run the eval.
 *
 * Idempotent: deletes any prior seed (slug prefix `eval-`) + the seed auth user
 * before re-inserting. SAFETY: refuses to run against the prod project ref.
 *
 * Usage (dev):  npm run ai:seed-eval
 * Requires NEXT_PUBLIC_SUPABASE_URL (dev), SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { generateEmbedding } from '@/lib/ai/embeddings';

const PROD_REF = 'obpdgihdskbxzgyctaib';
const SEED_EMAIL = 'ai-eval-seed@e2e-test.baazar.io.local';
const SEED_PASSWORD = 'AiEvalSeed!Pw123';

interface SeedVendor {
  slug: string;
  business_name: string;
  category: string;
  bio: string; // deliberately generic — no city/language/event facts
  base_city: string;
  service_area: string[];
  languages: string[];
  served_event_types: string[];
  subcategories: string[];
  services: string[];
  years_in_business: number;
}

// prettier-ignore
const VENDORS: SeedVendor[] = [
  { slug: 'eval-lens-and-light', business_name: 'Lens & Light Studio', category: 'photography', bio: 'Timeless love stories told with a warm, candid eye.', base_city: 'Naperville', service_area: ['Naperville', 'Aurora', 'Chicago'], languages: ['Punjabi', 'Hindi'], served_event_types: ['wedding', 'engagement'], subcategories: ['candid', 'documentary'], services: ['photography'], years_in_business: 9 },
  { slug: 'eval-golden-hour-films', business_name: 'Golden Hour Films', category: 'photography', bio: 'Editorial, magazine-style imagery for modern couples.', base_city: 'Schaumburg', service_area: ['Schaumburg', 'Chicago'], languages: ['Gujarati', 'English'], served_event_types: ['wedding', 'reception'], subcategories: ['editorial', 'fine-art'], services: ['photography', 'videography'], years_in_business: 6 },
  { slug: 'eval-frame-forty', business_name: 'Frame Forty', category: 'photography', bio: 'Bold, colorful storytelling from first look to last dance.', base_city: 'Chicago', service_area: ['Chicago'], languages: ['Tamil', 'English'], served_event_types: ['wedding', 'sangeet'], subcategories: ['candid'], services: ['photography'], years_in_business: 12 },
  { slug: 'eval-motion-reel-co', business_name: 'Motion Reel Co', category: 'videography', bio: 'Cinematic wedding films with a documentary heart.', base_city: 'Aurora', service_area: ['Aurora', 'Naperville'], languages: ['Urdu', 'Hindi'], served_event_types: ['wedding', 'walima'], subcategories: ['cinematic'], services: ['videography'], years_in_business: 7 },
  { slug: 'eval-henna-by-anaya', business_name: 'Henna by Anaya', category: 'mehndi', bio: 'Intricate, skin-safe artistry for your celebration.', base_city: 'Devon', service_area: ['Devon', 'Chicago'], languages: ['Urdu', 'Hindi'], served_event_types: ['mehndi', 'wedding'], subcategories: ['bridal', 'arabic'], services: ['mehndi'], years_in_business: 10 },
  { slug: 'eval-mehndi-maven', business_name: 'Mehndi Maven', category: 'mehndi', bio: 'Modern and traditional designs by an award-winning artist.', base_city: 'Naperville', service_area: ['Naperville', 'Aurora'], languages: ['Hindi', 'Punjabi'], served_event_types: ['mehndi', 'sangeet'], subcategories: ['bridal', 'minimal'], services: ['mehndi'], years_in_business: 5 },
  { slug: 'eval-glow-by-simran', business_name: 'Glow by Simran', category: 'hair_makeup', bio: 'Soft-glam and editorial looks that last all night.', base_city: 'Schaumburg', service_area: ['Schaumburg', 'Chicago'], languages: ['Punjabi', 'Hindi'], served_event_types: ['wedding', 'reception'], subcategories: ['bridal', 'airbrush'], services: ['hair_makeup'], years_in_business: 8 },
  { slug: 'eval-kohl-and-rouge', business_name: 'Kohl & Rouge', category: 'hair_makeup', bio: 'Luxury bridal beauty tailored to your features.', base_city: 'Chicago', service_area: ['Chicago', 'Oak Brook'], languages: ['Arabic', 'English'], served_event_types: ['wedding', 'walima'], subcategories: ['bridal', 'hair'], services: ['hair_makeup'], years_in_business: 11 },
  { slug: 'eval-dj-dhol-raj', business_name: 'DJ Dhol Raj', category: 'dj', bio: 'High-energy sets that keep the floor packed till close.', base_city: 'Aurora', service_area: ['Aurora', 'Naperville', 'Chicago'], languages: ['Punjabi', 'Hindi'], served_event_types: ['sangeet', 'reception', 'wedding'], subcategories: ['bhangra', 'bollywood'], services: ['dj', 'live_music'], years_in_business: 14 },
  { slug: 'eval-bassline-events', business_name: 'Bassline Events', category: 'dj', bio: 'Curated soundscapes and seamless MC transitions.', base_city: 'Chicago', service_area: ['Chicago'], languages: ['Tamil', 'English'], served_event_types: ['reception', 'wedding'], subcategories: ['bollywood', 'top40'], services: ['dj'], years_in_business: 4 },
  { slug: 'eval-saffron-spoon', business_name: 'Saffron Spoon Catering', category: 'catering', bio: 'Chef-driven menus with premium seasonal ingredients.', base_city: 'Naperville', service_area: ['Naperville', 'Aurora', 'Chicago'], languages: ['Hindi', 'Punjabi'], served_event_types: ['wedding', 'reception'], subcategories: ['north-indian', 'halal'], services: ['catering'], years_in_business: 13 },
  { slug: 'eval-tandoor-table', business_name: 'Tandoor Table', category: 'catering', bio: 'Live stations and family-style feasts done right.', base_city: 'Devon', service_area: ['Devon', 'Chicago', 'Skokie'], languages: ['Urdu', 'Hindi'], served_event_types: ['walima', 'wedding'], subcategories: ['halal', 'mughlai'], services: ['catering'], years_in_business: 9 },
  { slug: 'eval-marigold-decor', business_name: 'Marigold Decor', category: 'decor', bio: 'Lush florals and statement mandaps, styled end to end.', base_city: 'Schaumburg', service_area: ['Schaumburg', 'Chicago'], languages: ['Gujarati', 'Hindi'], served_event_types: ['wedding', 'mehndi'], subcategories: ['mandap', 'floral'], services: ['decor'], years_in_business: 10 },
  { slug: 'eval-velvet-events', business_name: 'Velvet Events Design', category: 'decor', bio: 'Contemporary tablescapes and dramatic lighting design.', base_city: 'Oak Brook', service_area: ['Oak Brook', 'Chicago'], languages: ['English'], served_event_types: ['reception', 'wedding'], subcategories: ['lighting', 'modern'], services: ['decor'], years_in_business: 6 },
  { slug: 'eval-crystal-banquets', business_name: 'Crystal Banquets', category: 'venue', bio: 'A grand ballroom with in-house coordination.', base_city: 'Elgin', service_area: ['Elgin', 'Schaumburg'], languages: ['Hindi', 'English'], served_event_types: ['wedding', 'reception'], subcategories: ['ballroom', 'indoor'], services: ['venue'], years_in_business: 20 },
  { slug: 'eval-spin-360-booth', business_name: 'Spin 360 Booth', category: 'photobooth', bio: 'Viral-ready photo experiences with instant sharing.', base_city: 'Chicago', service_area: ['Chicago', 'Naperville'], languages: ['English'], served_event_types: ['reception', 'sangeet'], subcategories: ['360-spinner', 'glam'], services: ['photobooth'], years_in_business: 3 },
  { slug: 'eval-rolling-sweets', business_name: 'Rolling Sweets Carts', category: 'carts', bio: 'Dessert and chai carts that delight every guest.', base_city: 'Naperville', service_area: ['Naperville', 'Aurora'], languages: ['Hindi', 'Punjabi'], served_event_types: ['mehndi', 'reception'], subcategories: ['dessert', 'chai'], services: ['carts'], years_in_business: 2 },
  { slug: 'eval-inkwell-invites', business_name: 'Inkwell Invites', category: 'invitations', bio: 'Custom letterpress and foil suites, start to finish.', base_city: 'Chicago', service_area: ['Chicago'], languages: ['English'], served_event_types: ['wedding'], subcategories: ['letterpress', 'foil'], services: ['invitations'], years_in_business: 7 },
  { slug: 'eval-regal-threads', business_name: 'Regal Threads Bridal', category: 'bridal_wear', bio: 'Handcrafted couture and heirloom-quality tailoring.', base_city: 'Devon', service_area: ['Devon', 'Chicago'], languages: ['Urdu', 'Hindi', 'Punjabi'], served_event_types: ['wedding', 'walima'], subcategories: ['lehenga', 'sherwani'], services: ['bridal_wear'], years_in_business: 15 },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  if (url.includes(PROD_REF)) {
    throw new Error('Refusing to seed: NEXT_PUBLIC_SUPABASE_URL points at the prod project.');
  }
  const supabase = createClient<Database>(url, key);

  // --- Clean any prior seed -------------------------------------------------
  await supabase.from('vendor_profiles').delete().like('slug', 'eval-%');
  const { data: existing } = await supabase.auth.admin.listUsers();
  const prior = existing?.users.find((u) => u.email === SEED_EMAIL);
  if (prior) await supabase.auth.admin.deleteUser(prior.id);

  // --- Seed auth user (one owner for all seed profiles) ---------------------
  const { data: created, error: userErr } = await supabase.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'AI Eval Seed', role: 'vendor' },
  });
  if (userErr || !created.user) throw new Error(`createUser failed: ${userErr?.message}`);
  const userId = created.user.id;
  await supabase.from('users').upsert({ id: userId, email: SEED_EMAIL, role: 'vendor' });

  // --- Insert profiles + OLD-shape embeddings (baseline) --------------------
  let ok = 0;
  for (const v of VENDORS) {
    // OLD embedding shape: business_name + bio + category (pre-enrichment).
    const oldText = `${v.business_name} ${v.bio} ${v.category}`;
    const embedding = await generateEmbedding(oldText);

    const { error: insErr } = await supabase.from('vendor_profiles').insert({
      user_id: userId,
      slug: v.slug,
      business_name: v.business_name,
      category: v.category as Database['public']['Tables']['vendor_profiles']['Row']['category'],
      bio: v.bio,
      base_city: v.base_city,
      service_area: v.service_area,
      languages: v.languages,
      served_event_types: v.served_event_types,
      subcategories: v.subcategories,
      services: v.services,
      years_in_business: v.years_in_business,
      is_active: true,
      onboarding_complete: true,
      embedding: JSON.stringify(embedding),
    } as never);
    if (insErr) console.error(`  ${v.slug}: ${insErr.message}`);
    else ok++;
  }

  console.log(`Seeded ${ok}/${VENDORS.length} vendors (OLD-shape embeddings = baseline).`);
  console.log(
    'Next: npm run ai:eval  (baseline) → npm run ai:reembed → npm run ai:eval (enriched)'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
