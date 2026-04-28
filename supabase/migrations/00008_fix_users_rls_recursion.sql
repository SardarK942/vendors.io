-- Fix: the "Admins can view all users" policy from migration 1 queries public.users
-- inside a SELECT policy on public.users, causing infinite recursion for every
-- authenticated read. Drop it. Admin access uses service_role which bypasses RLS.
-- If an admin UI needs this capability later, re-add using a SECURITY DEFINER function
-- or a JWT custom claim — not a self-referencing policy.

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
