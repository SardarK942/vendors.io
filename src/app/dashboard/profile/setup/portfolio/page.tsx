import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StepPortfolio } from '@/components/onboarding/StepPortfolio';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('portfolio_images')
    .eq('user_id', user.id)
    .maybeSingle();
  return (
    <StepPortfolio
      initial={{
        portfolioImages: profile?.portfolio_images ?? [],
      }}
    />
  );
}
