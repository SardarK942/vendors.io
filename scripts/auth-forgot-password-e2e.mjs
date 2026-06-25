/**
 * E2E walkthrough of the forgot-password flow.
 * Run: node scripts/auth-forgot-password-e2e.mjs
 *
 * Creates a test account → submits the /forgot-password form → uses the
 * Supabase admin API to grab the actual recovery link (bypassing the email
 * round-trip) → clicks it → sets a new password → confirms login + cleanup.
 */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

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
const EMAIL = `forgot-e2e-${STAMP}@example.com`;
const OLD_PASSWORD = 'OldPassword123!';
const NEW_PASSWORD = 'NewPassword456!';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function banner(text) {
  console.log('\n' + '═'.repeat(70));
  console.log('  ' + text);
  console.log('═'.repeat(70));
}

async function createTestUser() {
  banner(`[setup] Creating test account: ${EMAIL}`);
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: OLD_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Forgot E2E', role: 'couple' },
  });
  if (error || !data.user) {
    console.error('createUser failed:', error?.message);
    process.exit(1);
  }
  await admin.from('users').upsert({ id: data.user.id, email: EMAIL, role: 'couple' });
  console.log(`[setup] Created user ${data.user.id}`);
  return data.user;
}

async function getRecoveryLink() {
  banner('[setup] Generating a recovery link via admin API (instead of emailing it)');
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: {
      redirectTo: `${BASE}/reset-password`,
    },
  });
  if (error || !data?.properties?.action_link) {
    console.error('generateLink failed:', error?.message);
    process.exit(1);
  }
  const link = data.properties.action_link;
  console.log(`[setup] Recovery link: ${link.slice(0, 80)}…`);
  return link;
}

async function cleanup(user) {
  if (!user) return;
  banner('[cleanup] Deleting test user');
  await admin.from('users').delete().eq('id', user.id);
  await admin.auth.admin.deleteUser(user.id);
  console.log('[cleanup] Done.');
}

async function main() {
  const testUser = await createTestUser();
  const recoveryLink = await getRecoveryLink();

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
    args: ['--window-size=1200,900'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();

  try {
    // 1. Login page — click "Forgot your password?"
    banner('1/6  /login — click "Forgot your password?"');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.getByRole('link', { name: /forgot your password/i }).click();
    await page.waitForURL(/\/forgot-password/, { timeout: 10000 });
    await page.waitForTimeout(2500);

    // 2. Forgot-password form — enter email + submit
    banner('2/6  /forgot-password — fill email + submit');
    await page.fill('input[type="email"]', EMAIL);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /send reset link/i }).click();
    await page.waitForTimeout(3500);
    console.log('  Should show "Check your email" confirmation');
    await page.waitForTimeout(2500);

    // 3. Click the recovery link directly (simulates the user clicking
    //    the link in their inbox).
    banner('3/6  Click the recovery link (admin-generated)');
    await page.goto(recoveryLink);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(3500);
    console.log('  Should land on /reset-password with the new-password form');
    console.log(`  Current URL: ${page.url()}`);

    // 4. Set new password
    banner('4/6  /reset-password — set new password');
    await page.fill('input[name="password"]', NEW_PASSWORD);
    await page.fill('input[name="confirm"]', NEW_PASSWORD);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /update password/i }).click();
    // Wait for navigation off /reset-password
    try {
      await page.waitForURL((url) => !url.toString().includes('/reset-password'), { timeout: 15000 });
    } catch {
      console.log('  ⚠ did not navigate away from /reset-password');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(2500);
    console.log(`  Current URL: ${page.url()}`);
    if (page.url().includes('/dashboard')) {
      console.log('  ✓ Landed on dashboard');
    }

    // 5. Sign out and confirm new password actually works
    banner('5/6  Sign out + log back in with NEW password');
    // Call supabase.auth.signOut() via the page context (no API route required)
    await page.evaluate(async () => {
      const { createBrowserClient } = await import('/_next/static/chunks/@supabase/ssr.js').catch(
        () => ({})
      );
      // Easier: nuke storage then reload
      localStorage.clear();
      sessionStorage.clear();
      document.cookie.split(';').forEach((c) => {
        const eq = c.indexOf('=');
        const name = (eq > -1 ? c.substr(0, eq) : c).trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    });
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', NEW_PASSWORD);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(3500);
    console.log(`  Current URL: ${page.url()}`);
    if (page.url().includes('/dashboard')) {
      console.log('  ✓ Signed in with the new password — round-trip succeeded');
    } else {
      console.log('  ✗ Did NOT reach /dashboard — something is off');
    }

    // 6. Try old password to verify it's actually been changed
    banner('6/6  Verify the OLD password no longer works');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie.split(';').forEach((c) => {
        const eq = c.indexOf('=');
        const name = (eq > -1 ? c.substr(0, eq) : c).trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    });
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', OLD_PASSWORD);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForTimeout(3500);
    if (page.url().includes('/login')) {
      console.log('  ✓ Old password rejected (still on /login) — change took effect');
    } else {
      console.log('  ✗ Old password somehow worked — change did NOT take effect');
    }

    banner('All assertions complete. Browser closing in 5s.');
    await page.waitForTimeout(5000);
  } catch (err) {
    console.error('\n[error]', err.message);
    console.error(err.stack);
    await page.waitForTimeout(5000);
  } finally {
    await browser.close();
    await cleanup(testUser);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
