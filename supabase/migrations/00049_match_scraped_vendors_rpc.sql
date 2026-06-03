-- Trigram-based fuzzy match RPC used by signup-time match.ts.
CREATE OR REPLACE FUNCTION match_scraped_vendors_by_name(
  p_name text,
  p_city text,
  p_min_similarity real DEFAULT 0.5,
  p_limit integer DEFAULT 5
) RETURNS TABLE (
  id uuid,
  business_name text,
  category text,
  city text,
  instagram_handle text,
  photos text[],
  bio text,
  similarity_score real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.business_name, sv.category, sv.city,
         sv.instagram_handle, sv.photos, sv.bio,
         similarity(sv.business_name, p_name) AS similarity_score
  FROM scraped_vendors sv
  WHERE sv.claimed_at IS NULL
    AND lower(sv.city) = lower(p_city)
    AND sv.business_name % p_name
    AND similarity(sv.business_name, p_name) >= p_min_similarity
  ORDER BY similarity(sv.business_name, p_name) DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_scraped_vendors_by_name FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_scraped_vendors_by_name TO authenticated, service_role;
