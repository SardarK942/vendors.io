-- Semantic vector search function (pgvector cosine similarity)
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
  starting_price_min INT,
  starting_price_max INT,
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
    vp.starting_price_min,
    vp.starting_price_max,
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

-- Full-text search function (fallback when semantic results < 5)
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
  starting_price_min INT,
  starting_price_max INT,
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
    vp.starting_price_min,
    vp.starting_price_max,
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

-- Function to expire stale booking requests (called by cron/edge function)
CREATE OR REPLACE FUNCTION expire_stale_booking_requests()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE booking_requests
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
