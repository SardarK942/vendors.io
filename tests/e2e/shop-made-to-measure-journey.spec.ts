/**
 * Made-to-measure journey — full E2E happy path.
 *
 * Models a real couple's journey end to end in one authenticated context:
 * browse the /shop catalog → click into a seeded made-to-measure product →
 * follow the "Set up your measurements" link → open the guided modal, fill and
 * save a fit profile → confirm the default "Bride" card persists across reload.
 *
 * Ties together the buyer catalog (shop-catalog.spec) and the measurement modal
 * (measurements-couple.spec) as a single navigational flow. Hits the DEV Supabase
 * (shared DB) so it asserts EXACT seeded strings; cleanup cascades on afterEach.
 */

import { test, expect } from '@playwright/test';
import {
  seedVendor,
  seedActiveProduct,
  seedCouple,
  cleanup,
  type TestVendor,
  type TestUser,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('made-to-measure journey (logged-in couple)', () => {
  let vendor: TestVendor | null = null;
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    vendor = null;
    couple = null;
  });

  test('browse → product → measurements → save persists across reload', async ({ page }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
    const product = await seedActiveProduct(vendor.vendorProfileId);
    couple = await seedCouple({ markOnboardingComplete: true });

    await loginAs(page, couple);

    // ── 1. Catalog grid ───────────────────────────────────────────────────────
    await page.goto('/shop');
    await expect(page.getByText(product.title)).toBeVisible({ timeout: 10_000 });
    // Selling vendor's business_name appears on the card.
    await expect(page.getByText('E2E Test Vendor').first()).toBeVisible();

    // ── 2. Click the product card into the detail page ─────────────────────────
    await page.locator(`a[href="/shop/${product.id}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/shop/${product.id}$`));
    await expect(page.getByRole('heading', { name: product.title })).toBeVisible({
      timeout: 10_000,
    });

    // Made-to-measure callout body + measurements link.
    await expect(page.getByText(/stitched to the wearer/i)).toBeVisible();
    const measurementsLink = page.getByRole('link', { name: /set up your measurements/i });
    await expect(measurementsLink).toBeVisible();

    // ── 3. Follow the "Set up your measurements" link ──────────────────────────
    await measurementsLink.click();
    await expect(page).toHaveURL(/\/dashboard\/measurements$/);

    // ── 4. Add a fit profile via the guided modal ──────────────────────────────
    await page.getByRole('button', { name: 'Add measurements' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill the first measurement.
    await page.getByTestId('measurement-input').fill('30');

    // Jump to the last measurement via the numbered index, then Review.
    await page.getByTestId('measurement-step').last().click();
    const nextBtn = page.getByTestId('measurement-next');
    await expect(nextBtn).toHaveText('Review');
    await nextBtn.click();

    // Save from the Review step.
    await page.getByRole('button', { name: 'Save fit profile' }).click();

    // ── 5. The default "Bride" card appears and survives a reload ──────────────
    await expect(page.getByText('Bride', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText('Bride', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
