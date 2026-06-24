// tests/e2e/bucket-j-customer-welcome-email-delivers.spec.ts
//
// Spec 7: Customer welcome email delivers — proxy assertion via DB.
//
// Strategy: Real email delivery is not testable in CI without inbox tooling.
// Proxy: after a first-login couple visits /signup/success, OnboardingGate fires
// POST /api/users/onboarding-complete (mark-on-show), which sets
// users.onboarding_completed_at. That confirms the gate fired — and would have
// triggered any welcome-email logic tied to first-login/onboarding-complete.
//
// Per Bucket J brief: "assert the proxy signal — onboarding_completed_at is set."
import { test, expect } from '@playwright/test';
import { seedCouple, cleanup, getServiceClient, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket J — customer welcome email delivers', () => {
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    couple = null;
  });

  test('OnboardingGate fires on first login → users.onboarding_completed_at set', async ({
    browser,
  }) => {
    // Seed with onboarding NOT complete so the gate fires
    couple = await seedCouple({ markOnboardingComplete: false });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, couple);

    // Navigate to /signup/success — OnboardingGate renders and calls
    // POST /api/users/onboarding-complete on mount (mark-on-show).
    await page.goto('/signup/success');
    await expect(page.getByText(/are you planning an event/i)).toBeVisible({ timeout: 10_000 });

    // Give the mark-on-show fetch a moment to complete
    await page.waitForTimeout(2_000);

    // Proxy assertion: onboarding_completed_at should now be set
    const sb = getServiceClient();
    const { data } = await sb
      .from('users')
      .select('onboarding_completed_at')
      .eq('id', couple.id)
      .single();
    expect(data?.onboarding_completed_at).not.toBeNull();

    await ctx.close();
  });
});
