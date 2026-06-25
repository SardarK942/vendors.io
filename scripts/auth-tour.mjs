/**
 * Open a headed browser and tour the new auth pages.
 * Run: node scripts/auth-tour.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

function banner(text) {
  console.log('\n' + '─'.repeat(60));
  console.log('  ' + text);
  console.log('─'.repeat(60));
}

async function main() {
  banner('Opening browser — watch the auth pages render');
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1200,900'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();

  banner('1/4  /login — shadcn login-01 + Baazar brand header + forgot-password link');
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(8000);

  banner('2/4  /signup — "Planning an Event" + 🎉 + claim-context support');
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(8000);

  banner('3/4  /forgot-password — new flow');
  await page.goto(`${BASE}/forgot-password`);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(8000);

  banner('4/4  /reset-password — "expired link" state (no session set)');
  await page.goto(`${BASE}/reset-password`);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForTimeout(8000);

  banner('Done. Closing browser in 5s — feel free to ctrl-C and explore yourself.');
  await page.waitForTimeout(5000);
  await browser.close();
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
