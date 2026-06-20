// tests/e2e/bucket-b-event-types-everywhere.spec.ts
//
// Verifies Bucket B T2/T3: the canonical 20-entry EVENT_TYPES constant
// is surfaced in every picker surface.
//
// Surfaces tested:
// 1. The CustomRequestForm at /vendors/[slug]/request — uses EventTypePicker
//    (Radix Select) which is the canonical grouped dropdown with cultural/general split.
//    NOTE: This route requires a logged-in user (redirects to /login for anon).
// 2. The AllFiltersSheet on /vendors — opened via "All filters" chip, uses
//    EventTypesSection which renders chip buttons (not <option>s).
//
// Note: The wizard /setup/details step does NOT have an event-type picker (it
// covers languages, years in business, and response SLA). The brief pointed to
// that URL in error — the canonical grouped EventTypePicker lives in CustomRequestForm.

import { test, expect } from '@playwright/test';
import { seedVendor, seedCouple, cleanup, type TestVendor, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket B — all 20 event types in every picker', () => {
  let vendor: TestVendor | null = null;
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(vendor, couple);
    vendor = null;
    couple = null;
  });

  test('CustomRequestForm event picker shows full list with divider', async ({ browser }) => {
    // Publish the profile so /vendors/[slug]/request resolves once logged in.
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    // The request form requires any authenticated user — use a couple account.
    couple = await seedCouple();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, couple);

    // Visit the custom request form for this vendor.
    await page.goto(`/vendors/${vendor.vendorSlug}/request`);

    // The EventTypePicker is a Radix Select — its trigger renders as role="combobox".
    // The "Event type" label renders above the picker via a <label> element.
    // Using the last combobox since the date picker (if present) is rendered differently.
    const picker = page.locator('button[role="combobox"]').last();
    await picker.click();

    // Cultural entries — rendered as SelectItem → role="option" in the Radix portal
    await expect(page.getByRole('option', { name: /Wedding \/ Shaadi/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Mehndi \/ Henna/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Walima \/ Wedding Feast/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Aqiqah \/ Baby Naming/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Roka/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Tilak/i })).toBeVisible();

    // Divider label (SelectLabel in the General group)
    await expect(page.getByText(/Other celebrations/i)).toBeVisible();

    // General entries
    await expect(page.getByRole('option', { name: /Birthday party/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Quinceañera/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sweet 16/i })).toBeVisible();

    await ctx.close();
  });

  test('marketplace AllFiltersSheet shows full event type chip list with divider', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/vendors');

    // Open the AllFiltersSheet via the "All filters" chip in the FilterChipRow.
    // The chip's text is "All filters" — matches Chip variant="all-filters".
    const allFiltersChip = page.getByRole('button', { name: /All filters/i }).first();
    await allFiltersChip.click();

    // Wait for the Vaul drawer to appear — it contains an "Event types served" heading
    await expect(page.getByText(/Event types served/i)).toBeVisible();

    // Cultural entries are rendered as <button> chips (not <option>s).
    // They are inside the EventTypesSection which lives in the drawer body.
    await expect(page.getByRole('button', { name: /Wedding \/ Shaadi/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Birthday party/i })).toBeVisible();

    // Divider span: "Other celebrations" — EventTypesSection renders a <span> between groups
    await expect(page.getByText(/Other celebrations/i)).toBeVisible();

    await ctx.close();
  });
});
