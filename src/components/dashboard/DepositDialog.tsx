'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DEPOSIT_RATE, formatPrice } from '@/lib/utils';

interface DepositDialogProps {
  bookingId: string;
  quoteAmountCents: number;
  vendorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DepositDialog({
  bookingId,
  quoteAmountCents,
  vendorName,
  open,
  onOpenChange,
}: DepositDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const depositCents = Math.round(quoteAmountCents * DEPOSIT_RATE);
  const remainingCents = quoteAmountCents - depositCents;

  const handleSubmit = async () => {
    if (!agreed) return;
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/deposit`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(data.error || 'Failed to create checkout');
      setLoading(false);
      return;
    }

    if (data.data?.checkoutUrl) {
      window.location.href = data.data.checkoutUrl;
    } else {
      toast.error('Could not redirect to checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay hold deposit</DialogTitle>
          <DialogDescription>
            {vendorName} — quote {formatPrice(quoteAmountCents)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit (5%)</span>
              <span className="font-medium">{formatPrice(depositCents)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Remaining (paid directly to vendor)</span>
              <span>{formatPrice(remainingCents)}</span>
            </div>
          </div>

          <p className="mb-3 text-xs text-ink/70">
            Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the
            remaining 95% directly to the vendor per their payment terms.
          </p>

          <div className="my-3 rounded-md border border-ink/10 bg-cream/50 p-3 text-xs">
            <p className="font-semibold text-ink">Cancellation policy</p>
            <p className="mt-1 text-ink/80">
              Your 5% deposit is fully refundable within 24 hours of booking. After that, it&apos;s
              non-refundable. If the vendor cancels, you get a full refund.
            </p>
            <Link
              href="/terms#cancellations"
              className="mt-2 inline-block text-ink underline hover-pink-text"
            >
              Full policy →
            </Link>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="agree-deposit"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <label htmlFor="agree-deposit" className="text-xs">
              I agree to the{' '}
              <Link href="/terms" className="underline hover-pink-text">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/terms#cancellations" className="underline hover-pink-text">
                Cancellation Policy
              </Link>
              .
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Not now
          </Button>
          <Button onClick={handleSubmit} disabled={!agreed || loading}>
            {loading ? 'Processing...' : `Pay ${formatPrice(depositCents)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
