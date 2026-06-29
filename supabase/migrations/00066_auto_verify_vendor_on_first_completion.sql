-- ============================================================================
-- Auto-verify vendor on first completed booking
-- ============================================================================
-- The `verified` flag on vendor_profiles has been manual-only since launch —
-- nothing in the code path ever sets it to true. The Verified filter chip on
-- /vendors only matches the handful of seeded/admin-flagged vendors.
--
-- Decision: first completed booking is a strong trust signal — couple paid
-- deposit, vendor delivered, couple confirmed completion (releasing funds).
-- Auto-flip `verified = true` on the same trigger that handles the rest of
-- completion mechanics (transaction status, fund release).
--
-- Behavior:
--   - Idempotent: only flips false → true. Already-verified vendors are no-op.
--   - Manual verification still works: admins can flip `verified = true` early
--     and this trigger leaves it alone.
--   - We never UNSET verified — once trust is earned, it stays. Manual revoke
--     is still possible via direct SQL if needed.
--
-- Trigger context: on_booking_completed already fires SECURITY DEFINER on
-- AFTER UPDATE of bookings.status. Adding the vendor_profiles UPDATE there
-- keeps the work atomic with status flip + transaction-status flip.

CREATE OR REPLACE FUNCTION public.on_booking_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    -- Move vendor's transaction from authorized/recognized → earned.
    -- (Unchanged from migration 00014.)
    UPDATE public.transactions
    SET
      status = 'earned',
      vendor_earned_at = now(),
      platform_fee_recognized_at = COALESCE(platform_fee_recognized_at, now())
    WHERE booking_request_id = NEW.id
      AND status IN ('authorized', 'recognized');

    -- Auto-verify the vendor on first completion. Idempotent — only flips
    -- false → true. Already-verified vendors (manual or prior completion)
    -- are unaffected.
    UPDATE public.vendor_profiles
    SET verified = true
    WHERE id = NEW.vendor_profile_id
      AND verified = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_catalog;
