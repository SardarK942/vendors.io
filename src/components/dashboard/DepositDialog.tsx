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
import { formatPrice } from '@/lib/utils';

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

  const depositCents = Math.round(quoteAmountCents / 10);
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
              <span className="text-muted-foreground">Deposit (10%)</span>
              <span className="font-medium">{formatPrice(depositCents)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Remaining (paid to vendor after event)</span>
              <span>{formatPrice(remainingCents)}</span>
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Cancellation policy:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>100% refund if you cancel within 24 hours of paying.</li>
              <li>50% refund if you cancel more than 30 days before the event.</li>
              <li>No refund if you cancel within 30 days of the event.</li>
              <li>100% refund if the vendor cancels.</li>
            </ul>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="agree-deposit"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <label htmlFor="agree-deposit" className="text-xs text-muted-foreground">
              I understand the cancellation policy and agree to the{' '}
              <Link href="/terms" target="_blank" className="underline">
                Terms
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
