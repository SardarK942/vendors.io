'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CreditCard, Wallet } from 'lucide-react';
import { paymentModeSchema } from '@/lib/onboarding/validation';
import { useFormErrors } from '@/hooks/useFormErrors';

interface Props {
  initial: 'stripe' | 'cash';
  profileId: string;
  mode: 'first' | 'next';
  primaryStripeAccountId: string | null;
}

export function StepPaymentMode({ initial, profileId, mode, primaryStripeAccountId }: Props) {
  const router = useRouter();
  const [paymentMode, setPaymentMode] = useState<'stripe' | 'cash'>(initial);
  // Sub-project I §6: in 'next' mode with a primary Stripe account available,
  // default to reuse. 'new' triggers a fresh Stripe Connect onboarding flow on
  // publish.
  const [stripeMode, setStripeMode] = useState<'reuse' | 'new'>('reuse');
  const { applyZodErrors, clearField, getError, total } = useFormErrors();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showStripeOverride =
    mode === 'next' && paymentMode === 'stripe' && primaryStripeAccountId !== null;

  async function onNext() {
    const parsed = paymentModeSchema.safeParse({ paymentMode });
    if (!parsed.success) {
      applyZodErrors(parsed.error);
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/vendor-profile/setup/payment-mode', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMode, profile_id: profileId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: 'Save failed' }));
      setServerError(e.error);
      return;
    }
    // Persist stripeMode in sessionStorage so the review/publish step can read it.
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`wizard:stripe_mode:${profileId}`, stripeMode);
    }
    const nextParam = mode === 'next' ? '?next=true' : '';
    router.push(`/dashboard/profile/setup/review${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">How do you want to receive payments?</h1>
        <p className="text-sm text-muted-foreground">Step 6 of 7</p>
      </div>

      {total >= 2 && (
        <p className="text-sm font-medium text-hot-pink">{total} fields need attention</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setPaymentMode('stripe');
            clearField('paymentMode');
          }}
          className={`rounded-lg border-2 p-6 text-left transition-colors ${
            paymentMode === 'stripe'
              ? 'border-primary bg-primary/5'
              : 'border-muted hover:border-muted-foreground/30'
          }`}
        >
          <CreditCard className="mb-3 h-8 w-8 text-primary" />
          <h3 className="mb-1 font-semibold">Through Baazar (recommended)</h3>
          <p className="text-sm text-muted-foreground">
            Couples pay a 10% deposit. We hold your portion until you set up Stripe Connect later.
            Best for tracking and dispute protection.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setPaymentMode('cash');
            clearField('paymentMode');
          }}
          className={`rounded-lg border-2 p-6 text-left transition-colors ${
            paymentMode === 'cash'
              ? 'border-primary bg-primary/5'
              : 'border-muted hover:border-muted-foreground/30'
          }`}
        >
          <Wallet className="mb-3 h-8 w-8 text-primary" />
          <h3 className="mb-1 font-semibold">Direct payments</h3>
          <p className="text-sm text-muted-foreground">
            Coordinate with each couple yourself (cash, Zelle, check, etc.). Baazar handles a small
            platform fee at booking — you handle the rest.
          </p>
        </button>
      </div>

      {getError('paymentMode') && (
        <p className="mt-1 text-xs text-hot-pink">{getError('paymentMode')}</p>
      )}

      {showStripeOverride && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium">Stripe account for this business</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              checked={stripeMode === 'reuse'}
              onChange={() => setStripeMode('reuse')}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">Use my existing Stripe account</span>{' '}
              <span className="text-muted-foreground">(recommended — zero new KYC)</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              checked={stripeMode === 'new'}
              onChange={() => setStripeMode('new')}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium">Set up a new Stripe account for this business</span>
              <br />
              <span className="text-xs text-muted-foreground">
                Pick this if you operate this business as a separate legal entity (separate tax ID).
              </span>
            </span>
          </label>
        </div>
      )}

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
