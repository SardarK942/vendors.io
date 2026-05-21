import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepOnline } from '@/components/onboarding/StepOnline';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function OnlinePage({ searchParams }: PageProps) {
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
    .select('instagram_handle, website_url')
    .eq('id', profileId)
    .maybeSingle();
  return (
    <StepOnline
      profileId={profileId}
      mode={mode}
      initial={{
        instagramHandle: profile?.instagram_handle ?? '',
        websiteUrl: profile?.website_url ?? '',
      }}
    />
  );
}
