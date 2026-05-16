import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { nextIncompleteStep } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

export default async function SetupIndex() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  redirect(`/dashboard/profile/setup/${nextIncompleteStep(profile)}`);
}
