/**
 * Shop catalog + product detail — E2E spec (anonymous buyer).
 *
 * Seeds a bridal_wear vendor + an active product (service-role, bypassing the
 * createProduct gate + RLS), then verifies the public /shop grid and the
 * /shop/[id] detail page render the seeded data: title, selling vendor,
 * formatted price, in/out-of-stock sizes, the made-to-measure callout, and the
 * "By <vendor>" link back to the vendor profile.
 *
 * Like the other seeded specs, this hits the DEV Supabase project and asserts
 * EXACT seeded titles because the DB is shared.
 */

import { test, expect } from '@playwright/test';
import { seedVendor, seedActiveProduct, cleanup, type TestVendor } from './helpers/seed';

test.describe('shop catalog (anonymous buyer)', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('catalog grid + product detail render seeded product', async ({ page }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    const product = await seedActiveProduct(vendor.vendorProfileId);

    // ── Catalog grid ──────────────────────────────────────────────────────────
    await page.goto('/shop');
    await expect(page.getByText(product.title)).toBeVisible({ timeout: 10_000 });
    // Selling vendor's business_name appears on the card.
    await expect(page.getByText('E2E Test Vendor').first()).toBeVisible();

    // ── Product detail ────────────────────────────────────────────────────────
    await page.goto(`/shop/${product.id}`);

    await expect(page.getByRole('heading', { name: product.title })).toBeVisible({
      timeout: 10_000,
    });

    // Base price 145000c → $1,450 (formatPriceFromCents rounds to whole dollars).
    await expect(page.getByText('$1,450').first()).toBeVisible();

    // Sizes: M in stock, L out of stock.
    await expect(page.getByRole('heading', { name: 'Available sizes' })).toBeVisible();
    const sizeM = page.getByTestId('variant-M');
    const sizeL = page.getByTestId('variant-L');
    await expect(sizeM).toContainText('M');
    await expect(sizeM).toContainText('In stock');
    await expect(sizeL).toContainText('L');
    await expect(sizeL).toContainText('Out of stock');

    // Made-to-measure callout + measurements link.
    await expect(page.getByText(/stitched to the wearer/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /set up your measurements/i })).toBeVisible();

    // "By <vendor>" link points at the vendor profile.
    const vendorLink = page.getByRole('link', { name: 'E2E Test Vendor' });
    await expect(vendorLink).toBeVisible();
    await expect(vendorLink).toHaveAttribute('href', `/vendors/${vendor.vendorSlug}`);
  });
});
