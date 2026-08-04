-- Fix: search_vendors_fulltext returns ts_rank (real) into a rank column
-- declared as FLOAT (double precision). Postgres treats every RETURN QUERY
-- through this function as a type mismatch and raises:
--   "structure of query does not match function result type
--    Returned type real does not match expected type double precision"
--
-- Result: every AI-search fulltext call from src/lib/ai/search.ts hits the
-- PostgrestError branch and returns []. Same silent-fail pattern the previous
-- 00065_fix_search_rpcs migration set out to eliminate, this time on the rank
-- type instead of the price columns.
--
-- Fix: recreate the function with `rank REAL` in RETURNS TABLE so the declared
-- type matches ts_rank's actual return type. The single caller (search.ts) reads
-- rank only for ordering, which the DB does before it hits the client, so the
-- narrower type is safe.

DROP FUNCTION IF EXISTS search_vendors_fulltext(TEXT, INT);

CREATE FUNCTION search_vendors_fulltext(
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
  rank REAL
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
