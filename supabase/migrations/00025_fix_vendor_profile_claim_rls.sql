-- ============================================================================
-- Fix — allow authenticated users to claim unclaimed vendor_profiles
-- ============================================================================
-- The existing UPDATE policy ("Vendors can update own profile") only allows
-- updates where auth.uid() = user_id. Unclaimed profiles have user_id IS NULL,
-- so the existing policy blocks the claim flow (claimVendorProfile in
-- vendor.service.ts silently affects 0 rows and returns "Failed to claim profile").
--
-- This adds a second UPDATE policy specifically for the claim transition:
--   - USING:  the row is unclaimed (user_id IS NULL)
--   - WITH CHECK: the new user_id matches the authenticated caller
-- so a user can only set the user_id to themselves, and only on a row that
-- is currently unclaimed. Both clauses together prevent a user from
-- (a) hijacking an already-claimed profile or (b) reassigning to a different user.
--
-- Caught during sub-project A smoke walk-through 2026-05-13.

CREATE POLICY "Authenticated users can claim unclaimed vendor profiles"
  ON public.vendor_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id IS NULL)
  WITH CHECK (user_id = auth.uid());
