import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OnboardingGate } from '@/components/onboarding/OnboardingGate';

export default async function SignupSuccessPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role, onboarding_completed_at')
    .eq('id', user.id)
    .single();

  const role = (profile?.role as 'couple' | 'vendor') ?? 'couple';
  const onboardingCompleted =
    profile?.onboarding_completed_at !== null && profile?.onboarding_completed_at !== undefined;

  // If onboarding was already completed (e.g. claim-flow vendor or backfilled
  // existing user), skip directly to dashboard.
  if (onboardingCompleted) {
    redirect('/dashboard');
  }

  return (
    <>
      <p className="sr-only">Account created — welcome to Baazar.</p>
      <OnboardingGate role={role} onboardingCompleted={onboardingCompleted} />
    </>
  );
}
