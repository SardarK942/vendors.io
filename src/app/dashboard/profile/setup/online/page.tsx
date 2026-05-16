import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepOnline } from '@/components/onboarding/StepOnline';

export const dynamic = 'force-dynamic';

export default async function OnlinePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('instagram_handle, website_url')
    .eq('user_id', user.id)
    .maybeSingle();
  return (
    <StepOnline
      initial={{
        instagramHandle: profile?.instagram_handle ?? '',
        websiteUrl: profile?.website_url ?? '',
      }}
    />
  );
}
