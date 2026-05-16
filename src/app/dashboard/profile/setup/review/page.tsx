import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepReview } from '@/components/onboarding/StepReview';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
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
  if (!profile) redirect('/dashboard/profile/setup/basics');
  return <StepReview profile={profile} />;
}
