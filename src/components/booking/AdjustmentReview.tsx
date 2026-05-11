'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const REASON_LABELS: Record<string, string> = {
  travel: 'Travel distance',
  guest_count: 'Guest count over package limit',
  peak_date: 'Peak-season date',
  custom: 'Custom requirements',
  setup_complexity: 'Setup complexity',
  discount: 'Discount applied',
  other: 'Other',
};

interface Props {
  bookingId: string;
  /** package base + selected addons (before any adjustment) */
  originalSubtotalCents: number;
  adjustmentCents: number;
  reason: string;
  explanation?: string | null;
}

export function AdjustmentReview({
  bookingId,
  originalSubtotalCents,
  adjustmentCents,
  reason,
  explanation,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function action(endpoint: 'accept-adjusted' | 'decline-adjusted') {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const json = await res.json();
        if (endpoint === 'accept-adjusted' && json.data?.deposit_checkout_url) {
          window.location.href = json.data.deposit_checkout_url;
        } else {
          window.location.reload();
        }
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? 'Action failed. Please try again.');
        setBusy(false);
      }
    } catch {
      alert('Network error. Please try again.');
      setBusy(false);
    }
  }

  const finalTotal = originalSubtotalCents + adjustmentCents;
  const isIncrease = adjustmentCents > 0;
  const isDiscount = adjustmentCents < 0;

  return (
    <div className="space-y-5 rounded-lg border p-6">
      <h3 className="text-base font-semibold">Vendor sent an adjusted quote</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Package + add-ons</p>
          <p className="text-lg font-medium">${(originalSubtotalCents / 100).toLocaleString()}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Adjustment</p>
          <p
            className={`text-lg font-medium ${isIncrease ? 'text-orange-600' : isDiscount ? 'text-green-600' : ''}`}
          >
            {adjustmentCents >= 0 ? '+' : ''}${(adjustmentCents / 100).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">{REASON_LABELS[reason] ?? reason}</p>
          {explanation && (
            <p className="text-xs italic text-muted-foreground">&ldquo;{explanation}&rdquo;</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Adjusted total</p>
          <p className="text-xl font-bold">${(finalTotal / 100).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => action('accept-adjusted')} disabled={busy}>
          Accept adjusted quote
        </Button>
        <Button variant="outline" onClick={() => action('decline-adjusted')} disabled={busy}>
          Decline
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        If you decline, the vendor will have 72 hours to send a revised quote.
      </p>
    </div>
  );
}

export default AdjustmentReview;
