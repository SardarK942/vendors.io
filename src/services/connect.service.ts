// src/services/connect.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import { stripe } from '@/lib/stripe/client';

type Client = SupabaseClient<Database>;

export interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

/**
 * Create (or fetch) the vendor's Stripe Standard connected account.
 *
 * `supabase` is the RLS client (gate lookup); `serviceClient` is the
 * service-role client that writes the row (vendors have no INSERT policy).
 * Gated to local bridal-wear vendors — the only lane that uses Connect.
 */
export async function getOrCreateConnectAccount(
  supabase: Client,
  serviceClient: Client,
  vendorProfileId: string
): Promise<ServiceResult<{ accountId: string }>> {
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('category, vendor_origin')
    .eq('id', vendorProfileId)
    .maybeSingle();

  if (!profile) return { error: 'Vendor profile not found', status: 404 };
  if (profile.category !== 'bridal_wear' || profile.vendor_origin !== 'local') {
    return { error: 'Payouts are only available to local bridal wear vendors', status: 403 };
  }

  const { data: existing } = await serviceClient
    .from('vendor_stripe_accounts')
    .select('stripe_account_id')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();

  if (existing) return { data: { accountId: existing.stripe_account_id }, status: 200 };

  const account = await stripe.accounts.create({ type: 'standard', country: 'US' });

  const { error } = await serviceClient
    .from('vendor_stripe_accounts')
    .insert({ vendor_profile_id: vendorProfileId, stripe_account_id: account.id })
    .select('stripe_account_id')
    .single();

  if (error) return { error: error.message, status: 500 };
  return { data: { accountId: account.id }, status: 201 };
}

/** Mint a single-use Stripe-hosted onboarding link. */
export async function createOnboardingLink(
  accountId: string,
  origin: string
): Promise<ServiceResult<{ url: string }>> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: `${origin}/dashboard/profile/payments?return=1`,
    refresh_url: `${origin}/dashboard/profile/payments?refresh=1`,
  });
  return { data: { url: link.url }, status: 200 };
}

/**
 * Sync the three readiness flags from Stripe onto our row. No-ops if the
 * account isn't one we track (webhook may deliver events for accounts created
 * by other flows). Writes with the service-role client.
 */
export async function refreshAccountStatus(
  serviceClient: Client,
  stripeAccountId: string
): Promise<void> {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  await serviceClient
    .from('vendor_stripe_accounts')
    .update({
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', stripeAccountId);
}

/** Read the vendor's payout status for the dashboard. */
export async function getConnectStatus(
  supabase: Client,
  vendorProfileId: string
): Promise<ServiceResult<ConnectStatus>> {
  const { data } = await supabase
    .from('vendor_stripe_accounts')
    .select('charges_enabled, payouts_enabled, details_submitted')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();

  return {
    data: {
      connected: data != null,
      charges_enabled: data?.charges_enabled ?? false,
      payouts_enabled: data?.payouts_enabled ?? false,
      details_submitted: data?.details_submitted ?? false,
    },
    status: 200,
  };
}
