-- Add an optional category filter to search_vendors_semantic so category is
-- applied in the WHERE clause (before LIMIT) rather than as a post-LIMIT filter
-- in TypeScript. Previously a relevant vendor ranked just past match_count was
-- unreachable for a category-scoped query. NULL p_category = no filter, so
-- existing callers are unaffected. Recreated (not ALTERed) because the return
-- shape is unchanged but the argument list grows.

DROP FUNCTION IF EXISTS search_vendors_semantic(VECTOR, INT, FLOAT);

CREATE FUNCTION search_vendors_semantic(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5,
  p_category TEXT DEFAULT NULL
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
    AND (p_category IS NULL OR vp.category = p_category)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
