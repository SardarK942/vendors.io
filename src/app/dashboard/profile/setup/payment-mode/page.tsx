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

  // NOTE: payment_mode column removed in Bucket F T4.
  // This page is now obsolete and should be redirected away or removed.
  // For now, returning empty to satisfy the route handler.
  return (
    <StepPaymentMode
      profileId={profileId}
      mode={mode}
      primaryStripeAccountId={null}
      initial={'stripe'}
    />
  );
}
