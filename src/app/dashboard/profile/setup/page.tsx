import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { nextIncompleteStep, getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface SetupIndexProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function SetupIndex({ searchParams }: SetupIndexProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sub-project I §6: preserve ?next=true through the wizard redirect chain.
  const sp = (await searchParams) ?? {};
  const mode: WizardMode = sp.next === 'true' ? 'next' : 'first';

  const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();

  const nextParam = mode === 'next' ? '?next=true' : '';
  redirect(`/dashboard/profile/setup/${nextIncompleteStep(profile)}${nextParam}`);
}
