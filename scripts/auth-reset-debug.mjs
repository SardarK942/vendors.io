/**
 * Diagnostic: dump the rendered content of /reset-password after the hash
 * is parsed.
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL = `reset-debug-${Date.now().toString(36)}@example.com`;

async function main() {
  console.log('Creating test user…');
  const { data: u } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: 'OldPassword123!',
    email_confirm: true,
  });
  await admin.from('users').upsert({ id: u.user.id, email: EMAIL, role: 'couple' });

  console.log('Generating link…');
  const { data: l } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: { redirectTo: 'http://localhost:3000/reset-password' },
  });
  const link = l.properties.action_link;

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Capture browser console for errors
  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[page-error]', err.message));

  console.log('Navigating to recovery link…');
  await page.goto(link);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

  console.log('Current URL:', page.url());

  // Wait a few seconds for Supabase to process the hash + form to render
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(1500);
    const visible = await page.evaluate(() => {
      const title = document.querySelector('h3,h2,h1,[class*="CardTitle"],[data-slot*="title"]')?.textContent ?? null;
      const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
        name: i.name,
        type: i.type,
        id: i.id,
      }));
      const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim());
      return { title, inputs, buttons };
    });
    console.log(`\n[${i * 1.5}s] title="${visible.title}" inputs=${JSON.stringify(visible.inputs)} buttons=${JSON.stringify(visible.buttons)}`);
  }

  await page.waitForTimeout(2000);
  await browser.close();

  // Cleanup
  await admin.from('users').delete().eq('id', u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
  console.log('Cleaned up');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
