-- 00037_vendor_list_enrichments_rpc.sql
-- Read-only RPC returning per-vendor derived enrichments used by the marketplace
-- card (confirmed wedding count + date availability).
--
-- "Confirmed" = deposit paid or completed; these are the statuses where a couple
-- has financially committed to the vendor (deposit_paid) or the event has
-- already occurred (completed). The other locking statuses
-- ('accepted', 'adjusted_quote_sent', 'adjusted_quote_declined') are transient
-- negotiation states, not yet financially committed.
--
-- Idempotent (CREATE OR REPLACE). No schema changes, just a function.

CREATE OR REPLACE FUNCTION vendor_list_enrichments(p_search_date date DEFAULT NULL)
RETURNS TABLE (
  vendor_profile_id uuid,
  confirmed_wedding_count int,
  is_available_for_date boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    vp.id AS vendor_profile_id,
    COALESCE((
      SELECT COUNT(*)::int
      FROM bookings b
      WHERE b.vendor_profile_id = vp.id
        AND b.status IN ('deposit_paid', 'completed')
    ), 0) AS confirmed_wedding_count,
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

GRANT EXECUTE ON FUNCTION vendor_list_enrichments(date) TO anon, authenticated;
