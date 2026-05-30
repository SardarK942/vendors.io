import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeInstagramHandle, normalizePhone } from '../../../scripts/scraper/lib/normalize';

export interface MatchInput {
  businessName: string;
  city: string;
  instagramHandle: string | null;
  phone: string | null;
}

export interface ScrapedVendorMatch {
  id: string;
  business_name: string;
  category: string | null;
  city: string | null;
  instagram_handle: string | null;
  photos: string[];
  bio: string | null;
  similarity_score: number; // 1.0 for IG/phone exact, 0..1 for name fuzzy
}

const MIN_SIMILARITY = 0.5;
const MAX_RESULTS = 5;

export async function findMatches(input: MatchInput): Promise<ScrapedVendorMatch[]> {
  const supabase = await createServiceRoleClient();
  const matches = new Map<string, ScrapedVendorMatch>();

  const ig = normalizeInstagramHandle(input.instagramHandle);
  const phone = normalizePhone(input.phone);

  if (ig) {
    const { data } = await supabase
      .from('scraped_vendors')
      .select('id, business_name, category, city, instagram_handle, photos, bio')
      .eq('instagram_handle', ig)
      .is('claimed_at', null);
    for (const row of data ?? []) {
      matches.set(row.id, { ...row, similarity_score: 1.0 });
    }
  }

  if (phone) {
    const { data } = await supabase
      .from('scraped_vendors')
      .select('id, business_name, category, city, instagram_handle, photos, bio')
      .eq('phone', phone)
      .is('claimed_at', null);
    for (const row of data ?? []) {
      if (!matches.has(row.id)) matches.set(row.id, { ...row, similarity_score: 1.0 });
    }
  }

  if (input.businessName && input.city) {
    const { data } = await supabase.rpc('match_scraped_vendors_by_name', {
      p_name: input.businessName,
      p_city: input.city,
      p_min_similarity: MIN_SIMILARITY,
      p_limit: MAX_RESULTS,
    });
    for (const row of (data as Array<{
      id: string;
      business_name: string;
      category: string | null;
      city: string | null;
      instagram_handle: string | null;
      photos: string[];
      bio: string | null;
      similarity_score: number;
    }>) ?? []) {
      if (!matches.has(row.id)) {
        matches.set(row.id, {
          id: row.id,
          business_name: row.business_name,
          category: row.category,
          city: row.city,
          instagram_handle: row.instagram_handle,
          photos: row.photos,
          bio: row.bio,
          similarity_score: row.similarity_score,
        });
      }
    }
  }

  return Array.from(matches.values())
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, MAX_RESULTS);
}
