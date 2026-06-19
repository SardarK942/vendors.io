'use client';

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

          <p className="mb-3 text-xs text-ink/70">
            Baazar charges a 5% deposit at booking. We keep that 5% as our platform fee. You pay the
            remaining 95% directly to the vendor per their payment terms.
          </p>

          <details className="mb-3 text-xs text-ink/70">
            <summary className="cursor-pointer font-medium text-ink">Cancellation policy</summary>
            <div className="mt-2 space-y-2">
              <p>
                <strong>Customer cancellation.</strong> Your 5% deposit is fully refundable within
                24 hours of booking. After that, the deposit confirms your reservation and is
                non-refundable.
              </p>
              <p>
                <strong>Vendor cancellation.</strong> If the vendor cancels at any time, you receive
                a full refund of your 5% deposit.
              </p>
              <p>
                The 95% balance you pay directly to the vendor is between you and them; Baazar
                doesn&apos;t process or hold those funds.
              </p>
            </div>
          </details>

          <div className="flex items-start gap-2">
            <input
              id="agree-deposit"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <label htmlFor="agree-deposit" className="text-xs text-muted-foreground">
              I understand the cancellation policy and agree to the Terms.
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
