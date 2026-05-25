-- Fix vendor_list_enrichments so it can read bookings + vendor_calendar_holds
-- across vendors. Both source tables have RLS that hides rows from anon callers,
-- which made the public marketplace see 0 weddings on every card and "Available"
-- on every vendor (false positive). The function is read-only and exposes only
-- two derived scalars (count + boolean) — no raw booking PII leaks.

CREATE OR REPLACE FUNCTION vendor_list_enrichments(p_search_date date DEFAULT NULL)
RETURNS TABLE (
  vendor_profile_id uuid,
  confirmed_wedding_count int,
  is_available_for_date boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    vp.id AS vendor_profile_id,
    COALESCE(
      (SELECT COUNT(*)::int
       FROM bookings b
       WHERE b.vendor_profile_id = vp.id
         AND b.status IN ('deposit_paid', 'completed')),
      0
    ) AS confirmed_wedding_count,
    CASE
      WHEN p_search_date IS NULL THEN NULL
      ELSE NOT EXISTS (
        SELECT 1 FROM vendor_calendar_holds vch
        WHERE vch.vendor_profile_id = vp.id
          AND vch.hold_range @> (p_search_date::timestamptz)
      )
    END AS is_available_for_date
  FROM vendor_profiles vp;
$$;

REVOKE EXECUTE ON FUNCTION vendor_list_enrichments(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vendor_list_enrichments(date) TO anon, authenticated;
