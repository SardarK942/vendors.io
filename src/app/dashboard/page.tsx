import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EarningsCard } from '@/components/dashboard/EarningsCard';
import { RecentUnlocks } from '@/components/dashboard/RecentUnlocks';
import { getVendorEarnings, type VendorEarnings } from '@/services/payment.service';
import { EVENT_TYPE_LABELS } from '@/lib/utils';

interface UnlockedBooking {
  id: string;
  completed_at: string | null;
  event_type: string;
  vendor_payout_total: number;
  couple_name: string | null;
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();

  const role = profile?.role || 'couple';

  let bookingCount = 0;
  let earnings: VendorEarnings | null = null;
  let recentUnlocks: UnlockedBooking[] = [];

  if (role === 'couple') {
    const { count } = await supabase
      .from('booking_requests')
      .select('*', { count: 'exact', head: true })
      .eq('couple_user_id', user.id);
    bookingCount = count ?? 0;
  } else if (role === 'vendor') {
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (vendorProfile) {
      const { count } = await supabase
        .from('booking_requests')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id);
      bookingCount = count ?? 0;

      const earningsResult = await getVendorEarnings(supabase, user.id);
      earnings = earningsResult.data ?? null;

      // Completed bookings in last 7 days → "funds unlocked" banner.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: completed } = await supabase
        .from('booking_requests')
        .select(
          'id, completed_at, event_type, transactions(vendor_payout), users!couple_user_id(full_name)'
        )
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'completed')
        .gte('completed_at', sevenDaysAgo)
        .order('completed_at', { ascending: false })
        .limit(5);

      recentUnlocks = (completed ?? []).map((b) => {
        const txs = (b.transactions as { vendor_payout: number }[] | null) ?? [];
        const coupleUserRel = Array.isArray(b.users) ? b.users[0] : b.users;
        return {
          id: b.id,
          completed_at: b.completed_at,
          event_type: EVENT_TYPE_LABELS[b.event_type] || b.event_type,
          vendor_payout_total: txs.reduce((sum, t) => sum + t.vendor_payout, 0),
          couple_name:
            (coupleUserRel as { full_name: string | null } | null)?.full_name?.split(' ')[0] ??
            null,
        };
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {role === 'vendor' && <RecentUnlocks unlocks={recentUnlocks} />}

        <Card>
          <CardHeader>
            <CardDescription>Total Bookings</CardDescription>
            <CardTitle className="text-3xl">{bookingCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Account Type</CardDescription>
            <CardTitle className="capitalize">{role}</CardTitle>
          </CardHeader>
        </Card>

        {role === 'vendor' && (
          <Card>
            <CardHeader>
              <CardDescription>Quick Action</CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="/dashboard/profile"
                className="text-sm font-medium text-primary hover:underline"
              >
                Edit your profile &rarr;
              </a>
            </CardContent>
          </Card>
        )}

        {role === 'couple' && (
          <Card>
            <CardHeader>
              <CardDescription>Quick Action</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/vendors" className="text-sm font-medium text-primary hover:underline">
                Browse vendors &rarr;
              </a>
            </CardContent>
          </Card>
        )}

        {role === 'vendor' && earnings && (
          <EarningsCard
            pendingEscrowCents={earnings.pending_escrow_cents}
            availableCents={earnings.available_cents}
            transferredCents={earnings.transferred_cents}
            requiresOnboarding={earnings.requires_onboarding}
            verificationPending={earnings.verification_pending}
            frozenReason={earnings.frozen_reason}
          />
        )}
      </div>
    </div>
  );
}
