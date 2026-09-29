/**
 * Vendor Shop editor — E2E spec.
 *
 * A bridal_wear vendor reaches the Shop list (NOT the non-bridal gate), creates
 * a product through the real editor UI — title, description, garment type,
 * price, a made-to-measure surcharge, and one in-stock size — and lands back on
 * the list with the new product visible.
 */

import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('vendor shop editor', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('bridal-wear vendor creates a product through the editor', async ({ page }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    await loginAs(page, vendor);

    const title = `E2E Editor Lehenga ${Date.now().toString(36)}`;

    // Shop list — bridal-wear vendors see the real list, not the gate.
    await page.goto('/dashboard/profile/shop');
    await expect(page.getByRole('heading', { name: 'Your Shop' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('The Shop is only available for bridal-wear vendors')).toHaveCount(
      0
    );

    // Into the editor.
    await page.getByRole('link', { name: '+ Add product' }).click();
    await expect(page).toHaveURL(/\/shop\/new/, { timeout: 10_000 });

    // Basics.
    await page.getByLabel('Title *').fill(title);
    await page
      .getByLabel('Description *')
      .fill('A seeded bridal lehenga created through the E2E editor flow.');

    // Garment type (shadcn Select — default is already Lehenga; select it explicitly).
    await page.getByLabel('Garment type').click();
    await page.getByRole('option', { name: 'Lehenga' }).click();

    // Pricing.
    await page.getByLabel('Base price *').fill('1450');

    // Stitching & fit — enable made-to-measure, then set a surcharge.
    await page.getByRole('button', { name: /Made to measure/ }).click();
    await page.getByLabel(/made-to-measure surcharge/i).fill('40');

    // Add one in-stock size.
    await page.getByRole('button', { name: '+ Add size' }).click();
    await page.getByLabel('Size', { exact: true }).fill('M');
    await page.getByLabel('Stock', { exact: true }).fill('3');

    // Save.
    await page.getByRole('button', { name: 'Create product' }).click();

    // Back on the list with the new product visible.
    await expect(page).toHaveURL(/\/dashboard\/profile\/shop$/, { timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });
});
