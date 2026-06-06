/**
 * Walkthrough: drive the full first-time-vendor flow headed so we can watch.
 *
 * Pre-req: run `npx tsx --env-file-if-exists=.env.local scripts/walkthrough/seed.ts`
 * to seed a fake "Chicago's Paan Cart" row + claim token. Reads the resulting
 * /tmp/walkthrough-seed.json.
 *
 * This is observation, not regression — no assertions that block the run.
 * Screenshots land in test-results/walkthrough/ for review.
 */

import { test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { seedVendorOnly, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

const SHOT_DIR = path.join(process.cwd(), 'test-results', 'walkthrough');

async function snap(page: import('@playwright/test').Page, name: string) {
  await fs.mkdir(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}`);
}

test.describe.configure({ mode: 'serial' });

let vendorUser: TestUser | null = null;

test.afterEach(async () => {
  if (vendorUser) {
    await cleanup(vendorUser);
    vendorUser = null;
  }
});

test('first-time vendor: public → claim → signup → onboarding → dashboard', async ({ page }) => {
  test.setTimeout(5 * 60_000); // generous, we're going slow on purpose
  const seedJson = await fs.readFile('/tmp/walkthrough-seed.json', 'utf8');
  const seed = JSON.parse(seedJson) as {
    slug: string;
    token: string;
    claim_url: string;
    public_url: string;
  };
  const email = `walkthrough+${Date.now()}@baazar.io`;
  const password = 'Walkthrough123!';

  console.log(`\n=== Walkthrough vendor signup === ${email}\n`);

  // ─── 1. Public homepage ───────────────────────────────────────────────────
  console.log('1/12  Homepage');
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await snap(page, '01-homepage');

  // ─── 2. Public /vendors marketplace ───────────────────────────────────────
  console.log('2/12  /vendors marketplace');
  await page.goto('/vendors');
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await snap(page, '02-marketplace');

  // ─── 3. Unclaimed listing page (what vendor will see linked) ──────────────
  console.log(`3/12  Public listing: ${seed.slug}`);
  await page.goto(`/vendors/${seed.slug}`);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await snap(page, '03-public-listing-unclaimed');

  // ─── 4. Click the claim URL as an unauthenticated user ────────────────────
  console.log('4/12  Claim URL (unauthenticated → signup redirect)');
  await page.goto(seed.claim_url);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await snap(page, '04-claim-redirect-to-signup');

  // ─── 5. Snap the new claim-aware signup form ──────────────────────────────
  console.log('5/12  Signup form (should show business banner + skip role picker)');
  await snap(page, '05-signup-form');

  // Fill the form to show the filled state — but we don't submit through the
  // real signUp API (email-confirmation flow is fragile to drive end-to-end).
  // We seed a vendor via admin API below to continue the walkthrough.
  const fullNameField = page.getByLabel(/full name/i).first();
  const emailField = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first();
  const passwordField = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await fullNameField.fill('Walkthrough Vendor');
  await emailField.fill(email);
  await passwordField.fill(password);
  const termsCheckbox = page.locator('input#agree');
  await termsCheckbox.check();
  await snap(page, '06-signup-filled');

  // ─── 6. Bypass real signup: seed a vendor via admin API + log in ─────────
  console.log('6/12  Seeding vendor via admin API + logging in');
  vendorUser = await seedVendorOnly();
  await loginAs(page, vendorUser);
  await snap(page, '07-after-login');

  // ─── 7. Now-authenticated visit /claim/<token> → token consumed ──────────
  console.log('7/12  Authenticated /claim/<token> → wizard redirect');
  await page.goto(seed.claim_url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  // Dismiss the "Welcome to Baazar for vendors" intro modal if it's mounted —
  // otherwise it overlays every subsequent snapshot.
  await page
    .locator('text=/skip for now/i')
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await snap(page, '08-onboarding-after-claim');

  // ─── 7. Walk each onboarding step (don't fill, just look) ─────────────────
  for (const step of ['basics', 'location', 'online', 'portfolio', 'review']) {
    console.log(`7/12  Wizard step: ${step}`);
    await page.goto(`/dashboard/profile/setup/${step}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1500);
    await snap(page, `09-wizard-${step}`);
  }

  // ─── 8. Dashboard ─────────────────────────────────────────────────────────
  console.log('8/12  Vendor dashboard');
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await snap(page, '10-dashboard');

  // ─── 9. Inbox / Operations / Money tabs if present ───────────────────────
  for (const sub of ['inbox', 'operations', 'money']) {
    console.log(`9/12  Dashboard tab: ${sub}`);
    await page.goto(`/dashboard/${sub}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);
    await snap(page, `11-dashboard-${sub}`);
  }

  // ─── 10. Visit the public listing as the now-signed-in vendor ────────────
  console.log('10/12 Public listing (signed in)');
  await page.goto(seed.public_url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await snap(page, '12-public-listing-signed-in');

  // ─── 11. Mobile viewport sample ───────────────────────────────────────────
  console.log('11/12 Mobile viewport check');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, '13-mobile-homepage');
  await page.goto('/vendors');
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, '14-mobile-marketplace');
  await page.goto(`/vendors/${seed.slug}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await snap(page, '15-mobile-listing');

  console.log('\n12/12 done. Screenshots in test-results/walkthrough/');
});
