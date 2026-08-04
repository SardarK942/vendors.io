/**
 * Vendor calendar feed — connect-and-verify E2E flow.
 *
 * Pre-req: run `npx tsx --env-file-if-exists=.env.local scripts/walkthrough/seed.ts`
 * to produce /tmp/walkthrough-seed.json. Its presence is used as a proxy guard
 * that .env.local + the Supabase dev connection are wired — the same guard as
 * walkthrough.spec.ts.
 *
 * The test creates a fresh vendor via the Supabase admin API, drives the full
 * connect-via-Google-Calendar flow, and asserts the card flips to "Connected".
 * Skipped in CI and skipped locally when the seed file is absent.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

// Skip the entire file when the walkthrough seed guard file is absent.
// Same predicate as walkthrough.spec.ts: its presence means .env.local + dev DB are wired.
test.skip(
  !fs.existsSync('/tmp/walkthrough-seed.json'),
  'requires /tmp/walkthrough-seed.json — run scripts/walkthrough/seed.ts first'
);

test.describe.configure({ mode: 'serial' });

let vendor: TestVendor | null = null;

test.beforeAll(async () => {
  vendor = await seedVendor({ publish: true });
});

test.afterAll(async () => {
  if (vendor) await cleanup(vendor);
});

test('vendor connects calendar via Google deep-link and verification flips to Connected', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  if (!vendor) throw new Error('vendor not seeded');

  // ── 1. Sign in as a freshly-seeded vendor ─────────────────────────────────
  await loginAs(page, vendor);

  // ── 2. Visit the calendar settings page ───────────────────────────────────
  await page.goto('/dashboard/profile/calendar');

  // Card shows the not-connected state
  await expect(page.getByText('See Baazar bookings in your calendar app')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();

  // ── 3. Open the choose-app modal ──────────────────────────────────────────
  // The first click may trigger FetchIntentAndOpen (generates the token) before
  // the modal renders, so we wait with a generous timeout.
  await page.getByRole('button', { name: /Choose your calendar app/ }).click();
  await expect(page.getByText('Choose your calendar app')).toBeVisible({ timeout: 10_000 });

  // ── 4. Click Google Calendar — new tab opens ───────────────────────────────
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: /Google Calendar/ }).click(),
  ]);
  expect(popup.url()).toContain('calendar.google.com/calendar/u/0/r?cid=');
  await popup.close();

  // ── 5. Card flips to Pending verification ─────────────────────────────────
  // postIntent('google') is fire-and-forget; give it up to 5 s to resolve.
  await expect(page.getByText('Pending verification')).toBeVisible({ timeout: 5000 });

  // ── 6. Read the feed URL from the rendered <code> element ─────────────────
  const feedUrl = (await page.locator('code').first().textContent())!;
  expect(feedUrl).toMatch(/\/api\/cal\/[A-Za-z0-9_-]+\.ics$/);

  // ── 7. Simulate a calendar app polling the feed with a recognised UA ───────
  // recordPoll() will flip the DB state from pending → connected when it sees
  // a recognised provider User-Agent and a 200 response.
  const response = await request.get(feedUrl, {
    headers: { 'user-agent': 'Google-Calendar-Importer' },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/text\/calendar/);

  // ── 8. Reload — card should now show the connected state ──────────────────
  await page.reload();
  await expect(page.getByText('Connected via')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Google Calendar')).toBeVisible();
});
