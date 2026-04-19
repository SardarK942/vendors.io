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
}
