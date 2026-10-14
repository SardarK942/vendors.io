'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ShopFulfillmentValues {
  offersPickup: boolean;
  offersShipping: boolean;
  shippingFeeCents: number;
  pickupNote: string | null;
}

export function ShopFulfillmentForm({ initial }: { initial: ShopFulfillmentValues }) {
  const router = useRouter();
  const [pickup, setPickup] = React.useState(initial.offersPickup);
  const [shipping, setShipping] = React.useState(initial.offersShipping);
  const [fee, setFee] = React.useState((initial.shippingFeeCents / 100).toFixed(2));
  const [note, setNote] = React.useState(initial.pickupNote ?? '');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const feeNumber = Number(fee);
  const feeValid = Number.isFinite(feeNumber) && feeNumber >= 0;
  const canSave = (pickup || shipping) && feeValid && !saving;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/vendor-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_offers_pickup: pickup,
          shop_offers_shipping: shipping,
          shop_shipping_fee_cents: Math.round(feeNumber * 100),
          shop_pickup_note: note.trim() === '' ? null : note.trim(),
        }),
      });
      setMessage(res.ok ? 'Saved.' : 'Could not save. Please try again.');
      if (res.ok) router.refresh();
    } catch {
      setMessage('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Fulfillment</h2>
        <p className="text-sm text-ink-soft">
          How buyers can receive their orders. Offer at least one.
        </p>
      </div>
      <div className="flex flex-wrap gap-6 text-sm text-ink">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} />
          Offer pickup
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shipping}
            onChange={(e) => setShipping(e.target.checked)}
          />
          Offer shipping
        </label>
      </div>
      {shipping && (
        <div className="max-w-[200px] space-y-1.5">
          <Label htmlFor="shop-ship-fee">Flat shipping fee (USD)</Label>
          <Input
            id="shop-ship-fee"
            inputMode="decimal"
            className="font-mono"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </div>
      )}
      {pickup && (
        <div className="space-y-1.5">
          <Label htmlFor="shop-pickup-note">Pickup note</Label>
          <Input
            id="shop-pickup-note"
            maxLength={300}
            placeholder="e.g. Devon Ave, by appointment"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving...' : 'Save fulfillment'}
        </Button>
        {message && (
          <span role="status" className="text-sm text-ink-muted">
            {message}
          </span>
        )}
      </div>
    </Card>
  );
}
