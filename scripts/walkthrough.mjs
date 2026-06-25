/**
 * Visual walkthrough of post-launch hotfix PR #64.
 * Run: node scripts/walkthrough.mjs
 *
 * Headed Chromium so you can watch. Each step waits ~3s so you can see
 * what's happening on screen.
 */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// ─── Load env from .env.local ────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const BASE = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const STAMP = Date.now().toString(36);
const EMAIL = `walkthrough-${STAMP}@example.com`;
const PASSWORD = 'WalkthroughPass123!';

async function createVendorAccount() {
  console.log(`\n[setup] Creating fresh vendor account: ${EMAIL}`);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Walkthrough Vendor', role: 'vendor' },
  });
  if (error || !data.user) {
    console.error('[setup] createUser failed:', error?.message);
    process.exit(1);
  }
  // public.users row (mirrors the vendor role for app-side queries)
  await admin.from('users').upsert({ id: data.user.id, email: EMAIL, role: 'vendor' });
  console.log(`[setup] User created. ID: ${data.user.id}`);
  return { id: data.user.id, email: EMAIL, password: PASSWORD };
}

async function cleanupVendor(user) {
  if (!user) return;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log(`\n[cleanup] Deleting test user ${user.email}`);
  // Delete any vendor_profile rows first (FK)
  await admin.from('vendor_profiles').delete().eq('user_id', user.id);
  await admin.from('users').delete().eq('id', user.id);
  await admin.auth.admin.deleteUser(user.id);
  console.log('[cleanup] Done.');
}

function banner(text) {
  console.log('\n' + '═'.repeat(70));
  console.log('  ' + text);
  console.log('═'.repeat(70));
}

async function main() {
  banner('Starting walkthrough — headed Chromium window opens next');
  let testUser = null;

  testUser = await createVendorAccount();

  const browser = await chromium.launch({
    headless: false,
    slowMo: 600,
    args: ['--window-size=1400,900'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ─── 1. Homepage ────────────────────────────────────────────────────────
    banner('1/8 — Homepage: wordmark cycle (#6) + hot-pink CTA (#7)');
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    console.log('  Watch the right-side wordmark cycle (Devanagari → Nastaliq → Naskh → Persian)');
    await page.waitForTimeout(8000); // full cycle through all 4 scripts

    const browseCta = page.getByRole('link', { name: /browse all vendors/i }).first();
    await browseCta.scrollIntoViewIfNeeded();
    await browseCta.hover();
    console.log('  Hovering hot-pink "Browse all vendors →" CTA');
    await page.waitForTimeout(2000);

    // ─── 2. /vendors browse page ────────────────────────────────────────────
    banner('2/8 — /vendors: no unclaimed strip (#9), filter rebuild');
    await browseCta.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log('  Only claimed vendors visible — no "More vendors" unclaimed strip');

    const filtersBtn = page.getByRole('button', { name: /all filters/i }).first();
    if (await filtersBtn.count()) {
      await filtersBtn.click();
      await page.waitForTimeout(2500);
      console.log('  "Coming soon — vendor data backing in a follow-up PR" section is hidden (#8)');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }

    // ─── 3. Vendor profile ──────────────────────────────────────────────────
    banner('3/8 — Vendor profile: sticky card + deposit copy (#1) + socials (#3) + spacing (#5)');
    const firstCard = page.locator('a[href*="/vendors/"][href*="-"]').first();
    if (await firstCard.count()) {
      await firstCard.scrollIntoViewIfNeeded();
      await firstCard.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      console.log('  Right sidebar: sticky card with "Vendor will arrange the remaining…" + IG/website row');

      // ─── 4. Smooth-scroll fix #2 ──────────────────────────────────────────
      banner('4/8 — "compare all packages ↓" smooth-scroll fix (#2)');
      const compareLink = page.getByText(/compare all .* packages/i).first();
      if (await compareLink.count()) {
        await compareLink.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(1500);
        await compareLink.click();
        await page.waitForTimeout(2500);
        console.log('  Should have landed on "Choose your package" heading, NOT the cards below');
      } else {
        console.log('  (compare link hidden — vendor has 0/1 packages — skipping)');
      }
    }

    // ─── 5. Login as fresh vendor ───────────────────────────────────────────
    banner('5/8 — Login as the fresh vendor we just created');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Find the email + password fields and the submit button
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    await emailInput.fill(testUser.email);
    await passInput.fill(testUser.password);
    await page.waitForTimeout(1200);
    console.log(`  Filling email: ${testUser.email}`);

    const signinBtn = page.getByRole('button', { name: /sign in|log in/i }).first();
    await signinBtn.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3500);

    // ─── 6. Dashboard sidebar IA ────────────────────────────────────────────
    banner('6/8 — Vendor sidebar IA refactor (#17): Packages + Business Analytics');
    console.log('  Dashboard loaded. Check sidebar: Home / Bookings / Notifications / Calendar / Packages / Business Analytics / Profile');
    await page.waitForTimeout(4000);

    // Click "Packages" to confirm it's a top-level entry
    const pkgLink = page.getByRole('link', { name: /^\s*Packages\s*$/i }).first();
    if (await pkgLink.count()) {
      await pkgLink.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      console.log('  Now on /dashboard/profile/packages with hot-pink "+ Add Package" CTA (#14)');
    }

    // Click "Business Analytics" to confirm the rename landed
    const analyticsLink = page.getByRole('link', { name: /business analytics/i }).first();
    if (await analyticsLink.count()) {
      await analyticsLink.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      console.log('  /dashboard/money page now titled "Business Analytics" (#17)');
    }

    // ─── 7. Onboarding wizard — Instagram optional (#11) + sidebar green (#12) ─
    banner('7/8 — Onboarding wizard: Instagram optional (#11) + sidebar green (#12)');
    await page.goto(`${BASE}/dashboard/profile/setup`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log('  Wizard sidebar visible: Basics / Location / Online presence / Profile details / Portfolio / Review');
    console.log('  None should be green yet — fresh account');
    await page.waitForTimeout(3000);

    // Try to navigate to online step directly to confirm Instagram is optional
    await page.goto(`${BASE}/dashboard/profile/setup/online`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log('  Instagram label should say "(optional)" — NOT have a red * marker');
    await page.waitForTimeout(3000);

    // ─── 8. Package save error surface (#15) ──────────────────────────────
    banner('8/8 — Package save: real error reason (#15)');
    await page.goto(`${BASE}/dashboard/profile/packages/new`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log('  Package editor open. (Skipping the submit-empty test — the new error surfacing kicks in when there are real validation failures)');
    await page.waitForTimeout(3000);

    banner('Walkthrough complete. Closing browser in 5s.');
    await page.waitForTimeout(5000);
  } catch (err) {
    console.error('\n[error]', err.message);
    console.error(err.stack);
    await page.waitForTimeout(5000);
  } finally {
    await browser.close();
    await cleanupVendor(testUser);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
