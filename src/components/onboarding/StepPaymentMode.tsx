'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CreditCard, Wallet } from 'lucide-react';

interface Props {
  initial: 'stripe' | 'cash';
}

export function StepPaymentMode({ initial }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'stripe' | 'cash'>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onNext() {
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/vendor-profile/setup/payment-mode', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMode: mode }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Save failed' }));
      setError(e.error);
      return;
    }
    router.push('/dashboard/profile/setup/review');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">How do you want to receive payments?</h1>
        <p className="text-sm text-muted-foreground">Step 5 of 6</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('stripe')}
          className={`rounded-lg border-2 p-6 text-left transition-colors ${
            mode === 'stripe' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
          }`}
        >
          <CreditCard className="h-8 w-8 mb-3 text-primary" />
          <h3 className="font-semibold mb-1">Through Baazar (recommended)</h3>
          <p className="text-sm text-muted-foreground">
            Couples pay a 10% deposit. We hold your portion until you set up Stripe Connect later. Best for tracking and dispute protection.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode('cash')}
          className={`rounded-lg border-2 p-6 text-left transition-colors ${
            mode === 'cash' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
          }`}
        >
          <Wallet className="h-8 w-8 mb-3 text-primary" />
          <h3 className="font-semibold mb-1">Direct payments</h3>
          <p className="text-sm text-muted-foreground">
            Coordinate with each couple yourself (cash, Zelle, check, etc.). Baazar handles a small platform fee at booking — you handle the rest.
          </p>
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
