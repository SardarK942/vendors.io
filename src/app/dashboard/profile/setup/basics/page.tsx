import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepBasics } from '@/components/onboarding/StepBasics';

export const dynamic = 'force-dynamic';

export default async function BasicsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('business_name, category, bio')
    .eq('user_id', user.id)
    .maybeSingle();
  return (
    <StepBasics
      initial={{
        businessName: profile?.business_name ?? '',
        category: profile?.category ?? '',
        bio: profile?.bio ?? '',
      }}
    />
  );
}
