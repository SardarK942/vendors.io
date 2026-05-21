import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { EarningsCard } from '@/components/dashboard/EarningsCard';
import { RecentUnlocks } from '@/components/dashboard/RecentUnlocks';
import { PayoutHistory } from '@/components/dashboard/PayoutHistory';
import { CashToCollect } from '@/components/dashboard/CashToCollect';
import {
  getVendorEarnings,
  getPayoutHistory,
  getCashToCollect,
} from '@/services/payment.service';
import type { PaymentMode } from '@/lib/utils';
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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'vendor') redirect('/dashboard');

  // Sub-project I §5: per-business money page.
  const { profile: vendorProfileRaw } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfileRaw) redirect('/dashboard/profile/setup');

  const paymentMode = ((vendorProfileRaw as unknown as { payment_mode?: string }).payment_mode ??
    'stripe') as PaymentMode;

  // ── Cash variant ────────────────────────────────────────────────
  if (paymentMode === 'cash') {
    const { data: cashRows } = await getCashToCollect(supabase, vendorProfileRaw.id);

    const { count: confirmedCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfileRaw.id)
      .in('status', ['deposit_paid', 'completed']);

    const today = new Date().toISOString().slice(0, 10);
    const { count: upcomingCount } = await supabase
      .from('booking_events')
      .select('id, bookings!inner(vendor_profile_id, status)', {
        count: 'exact',
        head: true,
      })
      .eq('bookings.vendor_profile_id', vendorProfileRaw.id)
      .eq('bookings.status', 'deposit_paid')
      .gte('event_date', today);

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Money</h1>

        <Card className="p-6">
          <h2 className="font-semibold">💵 You and your client handle the 95%</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Baazar holds a 5% deposit to lock in the booking; everything else is yours to
            arrange.
          </p>
        </Card>

        <div className="grid gap-4 grid-cols-2">
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Confirmed bookings</div>
            <div className="mt-1 text-2xl font-semibold">{confirmedCount ?? 0}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Upcoming events</div>
            <div className="mt-1 text-2xl font-semibold">{upcomingCount ?? 0}</div>
          </Card>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Cash to collect at upcoming events</h2>
          <CashToCollect rows={cashRows ?? []} />
        </section>
      </div>
    );
  }

  // ── Stripe variant ──────────────────────────────────────────────
  const earningsResult = await getVendorEarnings(supabase, user.id);
  const earnings = earningsResult.data ?? null;
  const payouts = await getPayoutHistory(supabase, vendorProfileRaw.id, { limit: 25 });

  // Sub-project I §7: detect if the active business shares its Stripe account
  // with at least one sibling business owned by the same user. When true, the
  // 3-card earnings summary reflects combined activity across all sharing
  // businesses, so we surface a footnote.
  let isSharedStripeAccount = false;
  const activeStripeAccountId = (vendorProfileRaw as unknown as { stripe_account_id?: string | null })
    .stripe_account_id ?? null;
  if (activeStripeAccountId) {
    const { count: sharingCount } = await supabase
      .from('vendor_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('stripe_account_id', activeStripeAccountId);
    isSharedStripeAccount = (sharingCount ?? 0) > 1;
  }

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
        (coupleUserRel as { full_name: string | null } | null)?.full_name?.split(' ')[0] ??
        null,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Money</h1>

      {earnings && (
        <>
          <EarningsCard
            pendingEscrowCents={earnings.pending_escrow_cents}
            availableCents={earnings.available_cents}
            transferredCents={earnings.transferred_cents}
            requiresOnboarding={earnings.requires_onboarding}
            verificationPending={earnings.verification_pending}
            frozenReason={earnings.frozen_reason}
          />
          {/* Sub-project I §7: shared-Stripe-account footnote */}
          {isSharedStripeAccount && (
            <p className="text-xs text-muted-foreground">
              Shared Stripe account with your other businesses — these numbers include all of them.
            </p>
          )}
        </>
      )}

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
