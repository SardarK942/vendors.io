import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EarningsCard } from '@/components/dashboard/EarningsCard';
import { RecentUnlocks } from '@/components/dashboard/RecentUnlocks';
import { PayoutHistory } from '@/components/dashboard/PayoutHistory';
import { getPayoutHistory } from '@/services/payment.service';
import { getActiveVendorProfile } from '@/lib/vendor/active';

export const dynamic = 'force-dynamic';

interface UnlockedBooking {
  id: string;
  completed_at: string | null;
  package_label: string;
  vendor_payout_total: number;
  couple_name: string | null;
}

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

  // Bucket F: single-mode payment model — no more cash/stripe branching. All
  // vendors see the attribution dashboard (EarningsCard) + recent-completion
  // history. The legacy payouts table is queried for historical Stripe-Connect
  // transfers (if any); under single mode no new rows are written but the
  // history surface is preserved for vendors who pre-date the migration.
  const payouts = await getPayoutHistory(supabase, vendorProfileRaw.id, { limit: 25 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: completed } = await supabase
    .from('bookings')
    .select(
      'id, completed_at, package_name_snapshot, transactions(vendor_payout), users!couple_user_id(full_name)'
    )
    .eq('vendor_profile_id', vendorProfileRaw.id)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(5);

  const recentUnlocks: UnlockedBooking[] = (completed ?? []).map((b) => {
    const txs = (b.transactions as { vendor_payout: number }[] | null) ?? [];
    const coupleUserRel = Array.isArray(b.users) ? b.users[0] : b.users;
    return {
      id: b.id,
      completed_at: b.completed_at,
      package_label:
        (b as unknown as Record<string, string | null>).package_name_snapshot ?? 'Booking',
      vendor_payout_total: txs.reduce((sum, t) => sum + t.vendor_payout, 0),
      couple_name:
        (coupleUserRel as { full_name: string | null } | null)?.full_name?.split(' ')[0] ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Money</h1>

      <EarningsCard vendorProfileId={vendorProfileRaw.id} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Payout history</h2>
        <PayoutHistory rows={payouts.data ?? []} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recent unlocks · last 7 days</h2>
        <RecentUnlocks unlocks={recentUnlocks} />
      </section>
    </div>
  );
}
