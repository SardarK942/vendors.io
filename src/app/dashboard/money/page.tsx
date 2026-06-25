import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EarningsCard } from '@/components/dashboard/EarningsCard';
import { getActiveVendorProfile } from '@/lib/vendor/active';

export const dynamic = 'force-dynamic';

export default async function MoneyPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'vendor') redirect('/dashboard');

  // Sub-project I §5: per-business money page.
  const { profile: vendorProfileRaw } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfileRaw) redirect('/dashboard/profile/setup');

  // Bucket F: single-mode payment model. Baazar retains the entire 5% deposit;
  // vendor handles the 95% balance directly with the customer off-platform.
  // There is no on-platform payout/unlock history under this model, so the
  // Money page only renders the EarningsCard (attribution dashboard).
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Business Analytics</h1>
        <p className="text-sm text-muted-foreground">Booking earnings attributed to Baazar.</p>
      </div>
      <EarningsCard vendorProfileId={vendorProfileRaw.id} />
    </div>
  );
}
