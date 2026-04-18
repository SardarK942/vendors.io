/**
 * Generates a fresh Stripe onboarding URL for a vendor's existing minimal account.
 * Used by the /dashboard/stripe/refresh page when an onboarding session expires
 * mid-flow. Callers expecting "create account + link" from the old Standard-flow
 * should now go through the quote flow (which auto-creates the minimal account)
 * and the Withdraw flow (which returns the full onboarding link).
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createFullOnboardingLink } from '@/lib/stripe/connect';

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select('id, stripe_accounts(stripe_account_id)')
    .eq('user_id', user.id)
    .single();

  if (!vp) {
    return NextResponse.json({ error: 'No vendor profile found' }, { status: 404 });
  }

  const stripeAccount = (vp.stripe_accounts as { stripe_account_id: string }[] | null)?.[0];
  if (!stripeAccount) {
    return NextResponse.json(
      { error: 'Stripe account not initialized. Submit a booking quote first.' },
      { status: 400 }
    );
  }

  const onboardingUrl = await createFullOnboardingLink(stripeAccount.stripe_account_id);

  return NextResponse.json({ data: { onboardingUrl } }, { status: 200 });
}
