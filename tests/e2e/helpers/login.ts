import type { Page } from '@playwright/test';
import type { TestUser } from './seed';

/** Log in through the /login page. Leaves the browser on /dashboard. */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').first().fill(user.email);
  await page.getByLabel('Password').first().fill(user.password);
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  // Wait for the "Signed in successfully" sonner toast to detach. It lands in the
  // top-right corner and overlaps the notification bell — clicks targeted at the
  // bell's center coordinate would otherwise hit the toast and silently no-op
  // even with { force: true }.
  await page
    .locator('[data-sonner-toast]')
    .first()
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => {});
}
