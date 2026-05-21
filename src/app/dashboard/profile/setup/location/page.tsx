import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepLocation } from '@/components/onboarding/StepLocation';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function LocationPage({ searchParams }: PageProps) {
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
    .select('base_address_line_1, base_city, base_state, base_postal_code, base_google_place_id, base_address_public')
    .eq('id', profileId)
    .maybeSingle();
  return (
    <StepLocation
      profileId={profileId}
      mode={mode}
      initial={{
        baseAddressLine1: profile?.base_address_line_1 ?? '',
        baseCity: profile?.base_city ?? '',
        baseState: profile?.base_state ?? '',
        basePostalCode: profile?.base_postal_code ?? '',
        baseGooglePlaceId: profile?.base_google_place_id ?? '',
        baseAddressPublic: profile?.base_address_public ?? false,
      }}
    />
  );
}
