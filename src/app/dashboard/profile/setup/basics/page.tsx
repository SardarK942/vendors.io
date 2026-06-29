import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepBasics } from '@/components/onboarding/StepBasics';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function BasicsPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sub-project I §6: resolve target profile (existing or freshly-created).
  const sp = (await searchParams) ?? {};
  const mode: WizardMode = sp.next === 'true' ? 'next' : 'first';
  const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('business_name, category, bio, subcategories')
    .eq('id', profileId)
    .maybeSingle();
  return (
    <StepBasics
      profileId={profileId}
      mode={mode}
      initial={{
        businessName: profile?.business_name ?? '',
        category: profile?.category ?? '',
        bio: profile?.bio ?? '',
        subcategories: (profile?.subcategories as string[] | null) ?? [],
      }}
    />
  );
}
