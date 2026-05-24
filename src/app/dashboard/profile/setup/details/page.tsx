import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';
import { StepDetails } from '@/components/onboarding/StepDetails';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ next?: string; backfill?: string }>;
}

export default async function DetailsStepPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const sp = (await searchParams) ?? {};
  const mode: WizardMode = sp.next === 'true' ? 'next' : 'first';
  const isBackfill = sp.backfill === 'true';

  const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('languages, years_in_business, response_sla_hours')
    .eq('id', profileId)
    .maybeSingle();

  return (
    <StepDetails
      profileId={profileId}
      mode={mode}
      isBackfill={isBackfill}
      profile={{
        languages: (profile?.languages as string[] | null) ?? null,
        years_in_business: profile?.years_in_business ?? null,
        response_sla_hours: profile?.response_sla_hours ?? null,
      }}
    />
  );
}
