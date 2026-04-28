import { stripe } from './client';

/**
 * Create a minimal Custom/controller Stripe account. Vendor provides only country + email;
 * full KYC (name, address, SSN, bank) is deferred until they want to withdraw.
 * Platform (us) owns fees, losses, and requirement collection. Vendor has no Stripe dashboard.
 */
export async function createMinimalAccount(
  vendorProfileId: string,
  email: string,
  country: string = 'US'
): Promise<{ accountId: string }> {
  const account = await stripe.accounts.create(
    {
      country,
      email,
      controller: {
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'application',
        stripe_dashboard: { type: 'none' },
      },
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { vendor_profile_id: vendorProfileId },
    },
    { idempotencyKey: `vp:${vendorProfileId}:account-create` }
  );

  return { accountId: account.id };
}

/**
 * Generate an onboarding URL for a vendor to complete full KYC (needed to withdraw).
 * Same mechanic as before, just framed differently in the UX — called from the "Withdraw"
 * flow when pending earnings exist and vendor hasn't finished onboarding.
 */
export async function createFullOnboardingLink(stripeAccountId: string): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/stripe/refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/stripe/success`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/** @deprecated Alias kept for transition — callers should migrate to createFullOnboardingLink. */
export const createAccountLink = createFullOnboardingLink;
