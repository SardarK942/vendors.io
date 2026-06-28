-- Fix: search_vendors_semantic + search_vendors_fulltext both reference
-- vp.starting_price_min and vp.starting_price_max in their RETURNS TABLE and
-- SELECT bodies, but those columns were dropped in migration 00028 when the
-- vendor_packages_price_band view took over pricing. Every call to either RPC
-- has been silently failing with "column does not exist" since 00028 landed;
-- the TypeScript wrapper catches the PostgrestError and returns []. Net effect:
-- AI search has returned 0 results for everyone since 2026-05 (Sub-project A).
--
-- Fix: drop the two missing columns from RETURNS TABLE and the SELECT. The
-- TypeScript callers in src/lib/ai/search.ts don't read those fields — the
-- page-level merge fetches pricing from vendor_packages_price_band separately.

CREATE OR REPLACE FUNCTION search_vendors_semantic(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  business_name TEXT,
  slug TEXT,
  category TEXT,
  bio TEXT,
  service_area TEXT[],
  portfolio_images TEXT[],
  instagram_handle TEXT,
  website_url TEXT,
  verified BOOLEAN,
  response_sla_hours INT,
  total_bookings INT,
  average_rating NUMERIC(3,2),
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id,
    vp.business_name,
    vp.slug,
    vp.category,
    vp.bio,
    vp.service_area,
    vp.portfolio_images,
    vp.instagram_handle,
    vp.website_url,
    vp.verified,
    vp.response_sla_hours,
    vp.total_bookings,
    vp.average_rating,
    1 - (vp.embedding <=> query_embedding) AS similarity
  FROM vendor_profiles vp
  WHERE vp.embedding IS NOT NULL
    AND 1 - (vp.embedding <=> query_embedding) > similarity_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_vendors_fulltext(
  search_query TEXT,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  business_name TEXT,
  slug TEXT,
  category TEXT,
  bio TEXT,
  service_area TEXT[],
  portfolio_images TEXT[],
  verified BOOLEAN,
  response_sla_hours INT,
  total_bookings INT,
  rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id,
    vp.business_name,
    vp.slug,
    vp.category,
    vp.bio,
    vp.service_area,
    vp.portfolio_images,
    vp.verified,
    vp.response_sla_hours,
    vp.total_bookings,
    ts_rank(to_tsvector('english', vp.searchable_text), plainto_tsquery('english', search_query)) AS rank
  FROM vendor_profiles vp
  WHERE to_tsvector('english', vp.searchable_text) @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;
