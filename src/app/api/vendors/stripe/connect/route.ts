import { NextResponse } from 'next/server';
import { createFullOnboardingLink } from '@/lib/stripe/connect';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();

  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select('id, stripe_accounts(stripe_account_id)')
    .eq('user_id', user.id)
    .single();

  if (!vp) throw new HttpError(404, 'No vendor profile found');

  const stripeAccount = (vp.stripe_accounts as { stripe_account_id: string }[] | null)?.[0];
  if (!stripeAccount) {
    throw new HttpError(400, 'Stripe account not initialized. Submit a booking quote first.');
  }

  const onboardingUrl = await createFullOnboardingLink(stripeAccount.stripe_account_id);
  return NextResponse.json({ data: { onboardingUrl } }, { status: 200 });
});
