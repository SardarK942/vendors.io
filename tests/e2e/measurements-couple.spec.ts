/**
 * Couple measurement profiles — E2E spec.
 *
 * A logged-in couple opens the guided measurement modal, fills a measurement,
 * jumps to Review via the numbered index, and saves a fit profile. Asserts the
 * default "Bride" card appears and — critically — survives a reload, proving the
 * POST /api/measurement-profiles + RLS + migration 00083 round-trip persisted.
 */

import { test, expect } from '@playwright/test';
import { seedCouple, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('couple measurement profiles', () => {
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    couple = null;
  });

  test('add a fit profile via the guided modal and persist it across reload', async ({ page }) => {
    couple = await seedCouple({ markOnboardingComplete: true });
    await loginAs(page, couple);

    await page.goto('/dashboard/measurements');

    // Empty state.
    await expect(page.getByText('No measurement profiles yet')).toBeVisible({ timeout: 10_000 });

    // Open the guided modal.
    await page.getByRole('button', { name: 'Add measurements' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill the first measurement (exercises the input + live validation).
    await page.getByTestId('measurement-input').fill('30');

    // Jump to the last measurement via the numbered index, then Review.
    await page.getByTestId('measurement-step').last().click();
    // On the last step the footer CTA reads "Review".
    const nextBtn = page.getByTestId('measurement-next');
    await expect(nextBtn).toHaveText('Review');
    await nextBtn.click();

    // Save from the Review step.
    await page.getByRole('button', { name: 'Save fit profile' }).click();

    // Default lehenga label is "Bride"; card should appear in the list.
    const brideCard = page.getByText('Bride', { exact: true });
    await expect(brideCard).toBeVisible({ timeout: 10_000 });

    // Reload — the profile must still be there (real persistence, not optimistic).
    await page.reload();
    await expect(page.getByText('Bride', { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
