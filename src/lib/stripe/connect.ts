import { stripe } from './client';

export async function createConnectAccount(
  vendorProfileId: string,
  email: string
): Promise<{ accountId: string; onboardingUrl: string }> {
  const account = await stripe.accounts.create({
    type: 'standard',
    email,
    metadata: { vendor_profile_id: vendorProfileId },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/stripe/refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/stripe/success`,
    type: 'account_onboarding',
  });

  return { accountId: account.id, onboardingUrl: accountLink.url };
}

export async function createAccountLink(stripeAccountId: string): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/stripe/refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/stripe/success`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}
