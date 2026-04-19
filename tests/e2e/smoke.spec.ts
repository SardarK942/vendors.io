import { test, expect } from '@playwright/test';

test.describe('smoke — unauthenticated marketplace', () => {
  test('homepage renders', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/wedding|vendor/i);
  });

  test('vendors list renders', async ({ page }) => {
    await page.goto('/vendors');
    // Whether the list has items depends on seed state; just assert no crash.
    await expect(page.locator('body')).not.toContainText(/application error/i);
  });

  test('dashboard is guarded — redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    expect(page.url()).toMatch(/\/login/);
  });

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body).toHaveProperty('checks');
  });

  test('webhook rejects unsigned POST', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      headers: { 'content-type': 'application/json' },
      data: { test: true },
    });
    expect(res.status()).toBe(400);
  });

  test('cron tick rejects unauthorized request', async ({ request }) => {
    const res = await request.post('/api/cron/tick');
    expect(res.status()).toBe(401);
  });
});
