import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EarningsCard } from '@/components/dashboard/EarningsCard';
import { RecentUnlocks } from '@/components/dashboard/RecentUnlocks';
import { PauseProfileToggle } from '@/components/dashboard/PauseProfileToggle';
import { getVendorEarnings, type VendorEarnings } from '@/services/payment.service';

interface UnlockedBooking {
  id: string;
  completed_at: string | null;
  package_label: string;
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
  let activePackageCount = 0;
  let vendorIsActive = true;

  if (role === 'couple') {
    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('couple_user_id', user.id);
    bookingCount = count ?? 0;
  } else if (role === 'vendor') {
    // Note: is_active column is from A1 migration; not yet in generated types.
    // Using `*` so the runtime value is available even though TypeScript doesn't know it.
    const { data: vendorProfileRaw } = await supabase
      .from('vendor_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    const vendorProfile = vendorProfileRaw as (typeof vendorProfileRaw & { is_active?: boolean }) | null;

    if (vendorProfile) {
      // is_active is a DB column (added in A1 migration); cast is safe at runtime.
      vendorIsActive = vendorProfile.is_active !== false;

      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id);
      bookingCount = count ?? 0;

      // Onboarding gate: count active packages
      const { count: pkgCount } = await supabase
        .from('packages')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('is_active', true);
      activePackageCount = pkgCount ?? 0;

      const earningsResult = await getVendorEarnings(supabase, user.id);
      earnings = earningsResult.data ?? null;

      // Completed bookings in last 7 days → "funds unlocked" banner.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: completed } = await supabase
        .from('bookings')
        .select(
          'id, completed_at, package_name_snapshot, transactions(vendor_payout), users!couple_user_id(full_name)'
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
          package_label: (b as unknown as Record<string, string | null>).package_name_snapshot ?? 'Booking',
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

      {/* A2: Vendor onboarding gate */}
      {role === 'vendor' && activePackageCount === 0 && (
        <Card className="bg-yellow-50 border-yellow-200 p-6">
          <h2 className="font-semibold text-yellow-900">Add a package to go live</h2>
          <p className="text-sm text-yellow-800 mt-1">
            Couples can only book vendors with at least one active package.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/dashboard/profile/packages/new">Add Package</Link>
          </Button>
        </Card>
      )}

      {/* A2: Profile paused banner */}
      {role === 'vendor' && !vendorIsActive && activePackageCount > 0 && (
        <Card className="bg-yellow-50 border-yellow-200 p-6">
          <h2 className="font-semibold text-yellow-900">Your profile is paused</h2>
          <p className="text-sm text-yellow-800 mt-1">
            You won&rsquo;t appear in search until you resume your profile.
          </p>
          <PauseProfileToggle isActive={false} />
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {role === 'vendor' && <RecentUnlocks unlocks={recentUnlocks} />}

        <Link href="/dashboard/bookings" className="block">
          <Card className="transition-colors hover:bg-accent">
            <CardHeader>
              <CardDescription>Total Bookings</CardDescription>
              <CardTitle className="text-3xl">{bookingCount}</CardTitle>
            </CardHeader>
          </Card>
        </Link>

        {role === 'vendor' && (
          <Card>
            <CardHeader>
              <CardDescription>Quick Action</CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="/dashboard/profile/setup"
                className="text-sm font-medium text-primary hover:underline"
              >
                Set up your profile &rarr;
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
