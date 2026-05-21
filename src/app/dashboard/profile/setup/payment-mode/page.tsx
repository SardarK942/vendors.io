import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepPaymentMode } from '@/components/onboarding/StepPaymentMode';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function PaymentModePage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const sp = (await searchParams) ?? {};
  const mode: WizardMode = sp.next === 'true' ? 'next' : 'first';
  const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('payment_mode')
    .eq('id', profileId)
    .maybeSingle();

  // Sub-project I §6: in 'next' mode, expose the user's primary Stripe account
  // so the override toggle can offer "Use my existing Stripe account".
  let primaryStripeAccountId: string | null = null;
  if (mode === 'next') {
    const { data: primary } = await supabase
      .from('vendor_profiles')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .not('stripe_account_id', 'is', null)
      .neq('id', profileId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    primaryStripeAccountId = primary?.stripe_account_id ?? null;
  }

  return (
    <StepPaymentMode
      profileId={profileId}
      mode={mode}
      primaryStripeAccountId={primaryStripeAccountId}
      initial={profile?.payment_mode ?? 'stripe'}
    />
  );
}
