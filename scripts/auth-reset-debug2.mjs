import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL = `reset-debug2-${Date.now().toString(36)}@example.com`;

async function main() {
  const { data: u } = await admin.auth.admin.createUser({ email: EMAIL, password: 'P@ss123!', email_confirm: true });
  await admin.from('users').upsert({ id: u.user.id, email: EMAIL, role: 'couple' });
  const { data: l } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: { redirectTo: 'http://localhost:3000/reset-password' },
  });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('[page-error]', e.message));

  console.log('Navigating to recovery link…');
  await page.goto(l.properties.action_link);
  await page.waitForLoadState('domcontentloaded');

  // Check what localStorage has
  await page.waitForTimeout(2000);
  const ls = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      // Truncate long values
      result[key] = val.length > 100 ? val.slice(0, 100) + '…' : val;
    }
    return result;
  });
  console.log('\nlocalStorage:', JSON.stringify(ls, null, 2));

  const cookies = await page.context().cookies();
  console.log('\nCookies:', cookies.map(c => `${c.name} (${c.value.length} chars)`).join(', '));

  // Force-call getSession + log result
  const sessionResult = await page.evaluate(async () => {
    // Try to find the Supabase client by inspecting window for any global it exposed
    const keys = Object.keys(window);
    const supabaseKey = keys.find(k => k.toLowerCase().includes('supabase'));
    return { keys: keys.length, supabaseKey };
  });
  console.log('\nWindow probe:', JSON.stringify(sessionResult));

  // Check current URL hash
  const url = page.url();
  console.log('\nCurrent URL has hash:', url.includes('#'));
  console.log('Hash length:', url.split('#')[1]?.length ?? 0);

  // Check sessionReady state via React DevTools (if available)
  await page.waitForTimeout(2000);
  const formState = await page.evaluate(() => {
    const passwordInput = document.querySelector('input[name="password"]');
    return {
      passwordInputExists: !!passwordInput,
      passwordDisabled: passwordInput?.disabled ?? null,
      ariaLabel: document.querySelector('[aria-label="Baazar"]')?.outerHTML?.slice(0, 80),
      cardTitleText: document.querySelector('h3, [class*="CardTitle"]')?.textContent,
    };
  });
  console.log('\nForm state at 4s:', JSON.stringify(formState, null, 2));

  await page.waitForTimeout(8000);
  await browser.close();
  await admin.from('users').delete().eq('id', u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
