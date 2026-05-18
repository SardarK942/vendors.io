import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepPaymentMode } from '@/components/onboarding/StepPaymentMode';

export const dynamic = 'force-dynamic';

export default async function PaymentModePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('payment_mode')
    .eq('user_id', user.id)
    .maybeSingle();

  return <StepPaymentMode initial={profile?.payment_mode ?? 'stripe'} />;
}
