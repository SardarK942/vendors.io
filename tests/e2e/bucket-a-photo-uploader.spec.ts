import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, getServiceClient, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket A — PhotoUploaderDrawer', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('closed state shows thumbnails + manage label; open drawer + ESC close', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const sb = getServiceClient();

    // Pre-seed two portfolio photos directly on the vendor profile (skips real UploadThing upload).
    // Keep vendor_profiles.onboarding_complete=false so the /setup/* layout does NOT redirect
    // away (it only redirects when onboarding_complete=true in 'first' mode).
    // Set users.onboarding_completed_at to suppress the OnboardingGate modal overlay so
    // pointer events on the wizard are not intercepted.
    await Promise.all([
      sb
        .from('vendor_profiles')
        .update({
          portfolio_images: ['https://example.com/photo-1.jpg', 'https://example.com/photo-2.jpg'],
          // onboarding_complete intentionally left false to avoid the setup layout redirect
        })
        .eq('id', vendor.vendorProfileId),
      sb
        .from('users')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', vendor.id),
    ]);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    // Navigate to Step 5 (Portfolio).
    await page.goto('/dashboard/profile/setup/portfolio');

    // --- Closed-state assertions ---

    // Trigger button reads "Manage photos (2)" (triggerLabel.manage + count).
    // Regex: case-insensitive, allows any whitespace between "photos" and "(2)".
    const triggerBtn = page.getByRole('button', { name: /manage photos.*\(2\)/i });
    await expect(triggerBtn).toBeVisible();

    // Two thumbnail images in the closed-state strip (above the trigger).
    // They are rendered as <img src="https://example.com/photo-{n}.jpg"> directly
    // in the closed-state div. Use src*= to target only our seeded URLs.
    const stripThumbs = page.locator('img[src*="example.com/photo-"]');
    await expect(stripThumbs).toHaveCount(2);

    // --- Open the drawer ---
    await triggerBtn.click();

    // ManageView header: "{n} of {maxFiles} photos"
    await expect(page.getByText(/2 of 10 photos/i)).toBeVisible();

    // "Add more" button is present (value.length < maxFiles).
    await expect(page.getByRole('button', { name: /add more/i })).toBeVisible();

    // Two thumbnails inside the open drawer (scoped to the vaul drawer element to
    // avoid double-counting the closed-state strip images, which remain in the DOM).
    const drawer = page.locator('[data-vaul-drawer]');
    const drawerThumbs = drawer.locator('img[src*="example.com/photo-"]');
    await expect(drawerThumbs).toHaveCount(2);

    // "Primary" badge on the first thumbnail (showPrimarySelector is true in StepPortfolio).
    await expect(drawer.getByText('Primary')).toBeVisible();

    // --- ESC closes the drawer ---
    await page.keyboard.press('Escape');

    // ManageView header disappears when drawer closes.
    await expect(page.getByText(/2 of 10 photos/i)).toBeHidden();
    // "Add more" button is gone.
    await expect(page.getByRole('button', { name: /add more/i })).toBeHidden();

    await ctx.close();
  });
});
