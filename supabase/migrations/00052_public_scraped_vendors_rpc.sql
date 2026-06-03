-- Public read surface for unclaimed scraped vendors.
-- Excludes phone, email, raw, enriched, source_external_id so PII never
-- reaches anon. Service-definer + search_path locked to public.

CREATE OR REPLACE FUNCTION public_scraped_vendors_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  state text,
  tags text[],
  instagram_handle text,
  website text,
  bio text,
  photos text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city, sv.state,
         sv.tags, sv.instagram_handle, sv.website, sv.bio, sv.photos
  FROM scraped_vendors sv
  WHERE sv.slug = p_slug
    AND sv.claimed_at IS NULL
    AND sv.disputed_at IS NULL
    AND sv.review_status NOT IN ('rejected', 'duplicate');
$$;

REVOKE EXECUTE ON FUNCTION public_scraped_vendors_by_slug FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_scraped_vendors_by_slug TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public_scraped_vendors_list(
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_limit integer DEFAULT 60
) RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  state text,
  instagram_handle text,
  bio text,
  photos text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city, sv.state,
         sv.instagram_handle, sv.bio, sv.photos
  FROM scraped_vendors sv
  WHERE sv.claimed_at IS NULL
    AND sv.disputed_at IS NULL
    AND sv.review_status NOT IN ('rejected', 'duplicate')
    AND (p_category IS NULL OR sv.category = p_category)
    AND (p_city IS NULL OR lower(sv.city) = lower(p_city))
  ORDER BY sv.scraped_at DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public_scraped_vendors_list FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_scraped_vendors_list TO anon, authenticated, service_role;
