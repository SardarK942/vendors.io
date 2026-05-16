-- ============================================================================
-- A-cleanup · Migration 00029
-- Purge smoke-test data from prod
-- ============================================================================
-- STEP 1 (verify before running):
--   SELECT id, status, couple_email, created_at
--   FROM bookings
--   WHERE status IN ('quoted', 'rejected')
--      OR couple_email = 'sardarm.khan942@gmail.com';
--
-- STEP 2 (verify count is small — a handful at most):
--   If counts are larger than expected, STOP and investigate before proceeding.
--
-- STEP 3: Run this file in Supabase SQL editor.
--
-- ON DELETE CASCADE on transactions + reviews handles child rows automatically.
-- The smoke-test users themselves are NOT deleted here — only the booking rows.
-- Adjust the WHERE clause if the smoke-test email or vendor changed.

-- Delete bookings in terminal-legacy states (quoted / rejected).
-- New production bookings should never reach these states; if count > 0 post-launch
-- investigate before running.
DELETE FROM bookings
WHERE status IN ('quoted', 'rejected');

-- Delete the 2026-05-03 smoke-test booking and all related rows.
-- Cascade: transactions, reviews deleted automatically.
DELETE FROM bookings
WHERE couple_email = 'sardarm.khan942@gmail.com';
