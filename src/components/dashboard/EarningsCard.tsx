'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';

interface EarningsCardProps {
  pendingEscrowCents: number;
  availableCents: number;
  transferredCents: number;
  requiresOnboarding: boolean;
  verificationPending: boolean;
  frozenReason: string | null;
}

export function EarningsCard({
  pendingEscrowCents,
  availableCents,
  transferredCents,
  requiresOnboarding,
  verificationPending,
  frozenReason,
}: EarningsCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // When Stripe is verifying, poll every 30s so UI flips automatically once verified.
  useEffect(() => {
    if (!verificationPending) return;
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(interval);
  }, [verificationPending, router]);

  const handleWithdraw = async () => {
    setLoading(true);
    const res = await fetch('/api/vendors/me/withdraw', { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(data.error || `Withdrawal failed (${res.status})`);
      setLoading(false);
      return;
    }

    if (data.data?.onboarding_url) {
      window.location.href = data.data.onboarding_url;
      return;
    }

    toast.success(`Transferred ${formatPrice(data.data.transferred_cents)} to your bank`);
    setLoading(false);
    window.location.reload();
  };

  const canWithdraw = availableCents > 0 && !frozenReason && !verificationPending;

  let withdrawLabel: string;
  if (verificationPending) withdrawLabel = 'Verifying with Stripe...';
  else if (requiresOnboarding) withdrawLabel = 'Set Up Payouts';
  else withdrawLabel = 'Withdraw';

  return (
    <Card className="sm:col-span-2 lg:col-span-3">
      <CardHeader>
        <CardTitle>Earnings</CardTitle>
        <CardDescription>Your share is 70% of each deposit. Platform retains 30%.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Pending (escrow)</p>
            <p className="text-2xl font-bold">{formatPrice(pendingEscrowCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Unlocks when booking is marked complete
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Available</p>
            <p className="text-2xl font-bold text-emerald-600">{formatPrice(availableCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ready to withdraw</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Transferred</p>
            <p className="text-2xl font-bold">{formatPrice(transferredCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Lifetime payouts</p>
          </div>
        </div>

        {verificationPending && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Stripe is verifying your account. This usually takes 1-2 minutes. We&apos;ll refresh
            automatically.
          </div>
        )}

        {frozenReason && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Account frozen: {frozenReason}. Contact support to resolve.
          </div>
        )}

        <div>
          <Button onClick={handleWithdraw} disabled={loading || !canWithdraw}>
            {loading ? 'Processing...' : withdrawLabel}
          </Button>
          {requiresOnboarding && availableCents > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              You&apos;ll complete Stripe identity verification to receive your first payout.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
