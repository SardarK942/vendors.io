import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  nextIncompleteStep,
  getOrCreateWizardProfile,
  type WizardMode,
} from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface SetupIndexProps {
  searchParams?: Promise<{ next?: string; claimed?: string }>;
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

  // Preserve ?next=true and the claim-resume flag through the step redirect.
  const qs = new URLSearchParams();
  if (mode === 'next') qs.set('next', 'true');
  if (sp.claimed) qs.set('claimed', sp.claimed);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  redirect(`/dashboard/profile/setup/${nextIncompleteStep(profile)}${query}`);
}
