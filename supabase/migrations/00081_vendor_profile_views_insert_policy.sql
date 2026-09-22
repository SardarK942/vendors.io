-- vendor_profile_views was created (00034) with RLS enabled, a SELECT policy,
-- and NO INSERT policy — on the assumption the insert would run via service_role.
-- But recordVendorProfileView (src/services/analytics.actions.ts) inserts with
-- the cookie-based (anon/authenticated) client so it can read the viewer's
-- identity via auth.getUser(). With no INSERT policy the insert was denied on
-- every profile view: "new row violates row-level security policy" (42501),
-- silently swallowed — so view analytics recorded nothing.
--
-- Add a scoped INSERT policy: anyone (anon or authenticated) may record a view,
-- but a logged-in inserter can only attribute the view to themselves — they
-- can't spoof another user's viewer_user_id. Anonymous views carry
-- viewer_user_id = NULL. This matches how append-only view tracking works while
-- keeping RLS meaningful.

DROP POLICY IF EXISTS "Anyone can record a profile view" ON vendor_profile_views;
CREATE POLICY "Anyone can record a profile view"
  ON vendor_profile_views FOR INSERT
  WITH CHECK (viewer_user_id IS NULL OR viewer_user_id = auth.uid());
