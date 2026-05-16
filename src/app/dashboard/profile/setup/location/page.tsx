import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepLocation } from '@/components/onboarding/StepLocation';

export const dynamic = 'force-dynamic';

export default async function LocationPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('base_address_line_1, base_city, base_state, base_postal_code, base_google_place_id, base_address_public')
    .eq('user_id', user.id)
    .maybeSingle();
  return (
    <StepLocation
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
