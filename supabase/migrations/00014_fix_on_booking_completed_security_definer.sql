-- ============================================================================
-- Fix: on_booking_completed trigger function must run as SECURITY DEFINER
-- ============================================================================
-- The original migration 00009 created this function without SECURITY DEFINER,
-- so it runs under the role that fired the originating UPDATE — typically the
-- couple's authenticated role. RLS on public.transactions only grants SELECT
-- (not UPDATE) to authenticated users, so the trigger's `UPDATE transactions`
-- silently affected 0 rows. Bookings would move to status='completed' but the
-- vendor's transaction would stay in 'recognized', never unlocking funds.
--
-- Fix: replace the function with SECURITY DEFINER + an explicit search_path so
-- the trigger runs with the function-owner's privileges (postgres / supabase
-- admin role) and bypasses RLS. SET search_path is best-practice hardening
-- against search-path injection on SECURITY DEFINER functions.
--
-- Surfaced 2026-05-03 during live-money smoke test on prod.

CREATE OR REPLACE FUNCTION public.on_booking_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.transactions
    SET
      status = 'earned',
      vendor_earned_at = now(),
      platform_fee_recognized_at = COALESCE(platform_fee_recognized_at, now())
    WHERE booking_request_id = NEW.id
      AND status IN ('authorized', 'recognized');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_catalog;
