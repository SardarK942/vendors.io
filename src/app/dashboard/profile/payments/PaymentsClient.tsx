'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { ConnectStatus } from '@/services/connect.service';

export function PaymentsClient({ status }: { status: ConnectStatus }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/connect/onboard', { method: 'POST' });
      const body = (await res.json()) as { data?: { url: string }; error?: string };
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Could not start setup');
      window.location.href = body.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  if (status.charges_enabled) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="mt-2 text-muted-foreground">
          You&rsquo;re set up to get paid. Customer payments for your shop will be sent to your
          connected Stripe account.
        </p>
      </div>
    );
  }

  const pending = status.connected && status.details_submitted;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Payouts</h1>
      <p className="mt-2 text-muted-foreground">
        {pending
          ? 'Almost there — finish verification with Stripe so you can receive payments. Any earnings from early sales are held until this is complete.'
          : 'Set up payouts with Stripe to receive payments for your shop. You can build your catalog first, but customers can only buy once this is done — and any earnings before then are held for you until you finish setup.'}
      </p>
      <Button className="mt-4" onClick={startOnboarding} disabled={loading}>
        {loading
          ? 'Opening Stripe…'
          : pending
            ? 'Finish verification'
            : 'Set up payouts with Stripe'}
      </Button>
      {error ? <p className="mt-2 text-sm text-hot-pink">{error}</p> : null}
    </div>
  );
}
