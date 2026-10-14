'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';
import type { BoutiqueCart, CartLineView } from '@/services/cart.service';
import { BagMtmResolve, type BagMeasurementProfile } from './BagMtmResolve';

type Fulfillment = 'pickup' | 'ship';

interface BagBoutiqueCardProps {
  cart: BoutiqueCart;
  profiles: BagMeasurementProfile[];
}

export function BagBoutiqueCard({ cart, profiles }: BagBoutiqueCardProps) {
  const router = useRouter();
  const segments: { value: Fulfillment; label: string }[] = [];
  if (cart.offersPickup) segments.push({ value: 'pickup', label: 'Pickup at boutique' });
  if (cart.offersShipping) {
    segments.push({
      value: 'ship',
      label:
        cart.shippingFeeCents === 0
          ? 'Ship \u00b7 Free'
          : `Ship \u00b7 +${formatPrice(cart.shippingFeeCents)}`,
    });
  }
  const [chosen, setChosen] = React.useState<Fulfillment | null>(null);
  // Fall back to the first offered mode if nothing chosen or the choice is no longer offered.
  const fulfillment: Fulfillment =
    segments.find((s) => s.value === chosen)?.value ?? segments[0]?.value ?? 'pickup';
  const [busy, setBusy] = React.useState(false);
  const pieces = cart.lines.reduce((n, l) => n + l.quantity, 0);

  async function patchQuantity(line: CartLineView, quantity: number) {
    if (quantity < 1 || quantity > line.stockQuantity) return;
    const res = await fetch(`/api/cart/items/${line.cartItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) toast.error('Could not update quantity.');
    router.refresh();
  }

  async function remove(line: CartLineView) {
    const res = await fetch(`/api/cart/items/${line.cartItemId}`, { method: 'DELETE' });
    if (!res.ok) toast.error('Could not remove that item.');
    router.refresh();
  }

  async function checkout() {
    if (!cart.ready || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: cart.vendorProfileId,
          fulfillment_type: fulfillment,
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      const url =
        body && typeof body === 'object' && 'url' in body
          ? (body as { url?: unknown }).url
          : undefined;
      if (!res.ok || typeof url !== 'string') throw new Error('checkout failed');
      window.location.assign(url);
    } catch {
      toast.error('Could not start checkout. Please try again.');
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-hairline bg-cream">
      <header className="flex items-baseline justify-between border-b border-hairline-soft px-6 pb-4 pt-5">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          {cart.vendorName}
        </h2>
        <span className="text-xs font-medium text-ink-soft">
          {pieces} {pieces === 1 ? 'piece' : 'pieces'}
        </span>
      </header>

      <div className="px-6 pb-6 pt-1">
        <ul>
          {cart.lines.map((line) => (
            <li
              key={line.cartItemId}
              className="flex gap-4 border-b border-hairline-soft py-[18px] last:border-b-0"
            >
              {line.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={line.imageUrl}
                  alt={line.title}
                  className="h-[75px] w-[60px] flex-none rounded-lg object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="h-[75px] w-[60px] flex-none rounded-lg bg-cream-soft"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink">{line.title}</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {line.isMadeToMeasure ? 'Made to measure' : `Size ${line.sizeLabel}`}
                </p>

                {line.isMadeToMeasure && <BagMtmResolve line={line} profiles={profiles} />}

                <div className="mt-2.5 flex items-center gap-3">
                  <div className="inline-flex items-center gap-3 rounded-md border border-hairline px-2.5 py-0.5 text-[13px] text-ink-muted">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${line.title}`}
                      onClick={() => void patchQuantity(line, line.quantity - 1)}
                      className="hover:text-hot-pink"
                    >
                      &minus;
                    </button>
                    <span className="font-mono text-ink">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${line.title}`}
                      onClick={() => void patchQuantity(line, line.quantity + 1)}
                      className="hover:text-hot-pink"
                    >
                      +
                    </button>
                  </div>
                  {line.stockQuantity > 0 && line.stockQuantity <= 2 && (
                    <span className="text-xs font-medium text-ink-muted">
                      Only {line.stockQuantity} left
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(line)}
                    className="text-xs font-medium text-ink-soft hover:text-hot-pink"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="whitespace-nowrap pt-px font-mono text-sm text-ink">
                {formatPrice(line.unitPriceCents * line.quantity)}
              </p>
            </li>
          ))}
        </ul>

        <fieldset className="mt-[22px]">
          <legend className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            How would you like to receive this?
          </legend>
          <div className="inline-flex overflow-hidden rounded-md border border-hairline">
            {segments.map((seg, i) => (
              <button
                key={seg.value}
                type="button"
                aria-pressed={fulfillment === seg.value}
                onClick={() => setChosen(seg.value)}
                className={cn(
                  'px-4 py-2.5 text-[13px] font-semibold transition-colors',
                  i > 0 && 'border-l border-hairline',
                  fulfillment === seg.value
                    ? 'bg-ink text-cream'
                    : 'bg-cream text-ink-muted hover:text-hot-pink'
                )}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-[22px] flex items-baseline justify-between border-t border-hairline pt-[18px]">
          <span className="text-sm font-medium text-ink-muted">Subtotal</span>
          <span className="font-mono text-[19px] font-medium text-ink">
            {formatPrice(cart.subtotalCents)}
          </span>
        </div>

        <p className="mt-3.5 flex items-start gap-2 text-[12.5px] leading-snug text-ink-soft">
          <span
            aria-hidden="true"
            className="mt-[5px] h-[7px] w-[7px] flex-none rounded-full bg-haldi"
          />
          <span>
            You won&apos;t be charged until {cart.vendorName} confirms your order, within 48 hours.
            We place a hold now; if they can&apos;t fulfill it, the hold is released.
          </span>
        </p>

        <Button
          type="button"
          size="lg"
          className="mt-5 w-full"
          disabled={!cart.ready || busy}
          onClick={() => void checkout()}
        >
          Check out this boutique
        </Button>
        {!cart.ready && (
          <p className="mt-2.5 text-center text-xs font-medium text-indigo">
            Add measurements to continue
          </p>
        )}
      </div>
    </section>
  );
}
