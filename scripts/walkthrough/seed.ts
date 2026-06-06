import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { mintTokenString, hashTokenString } from '../scraper/lib/claim-token';
import { generateScrapedVendorSlug } from '../scraper/lib/slug';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

async function main() {
  const supabase = createServiceRoleClient();
  const id = crypto.randomUUID();
  const businessName = "Chicago's Paan Cart (walkthrough)";
  const slug = generateScrapedVendorSlug(businessName, id);

  const { error: insertErr } = await supabase.from('scraped_vendors').insert({
    id,
    slug,
    source: 'hand_curated',
    business_name: businessName,
    category: 'carts',
    tags: ['__walkthrough__'],
    city: 'Chicago',
    state: 'IL',
    photos: [
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1200',
      'https://images.unsplash.com/photo-1606755456206-aac6ab1d70ce?w=1200',
    ],
    phone: '(312) 555-0143',
    website: 'https://example.com/paan',
    instagram_handle: 'walkthrough_paan_cart',
    raw: { walkthrough: true },
  });
  if (insertErr) throw insertErr;

  const token = mintTokenString(id);
  const { error: tokenErr } = await supabase.from('claim_tokens').insert({
    scraped_vendor_id: id,
    token_hash: hashTokenString(token),
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
  });
  if (tokenErr) throw tokenErr;

  const payload = {
    scraped_vendor_id: id,
    slug,
    token,
    claim_url: `http://localhost:3000/claim/${token}`,
    public_url: `http://localhost:3000/vendors/${slug}`,
  };
  await fs.writeFile('/tmp/walkthrough-seed.json', JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
