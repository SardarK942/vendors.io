'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn, formatPrice } from '@/lib/utils';
import { computeCommissionCents } from '@/lib/shop/money';
import type { OrderConfirmationOrder } from '@/components/shop/OrderConfirmation';

interface VendorOrderConfirmProps {
  order: OrderConfirmationOrder;
  /** Whether the vendor can be paid out directly (Stripe charges enabled). */
  chargesEnabled: boolean;
  /** Injectable clock for tests. */
  now?: Date;
}

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface MeasurementSet {
  unit: string | null;
  fields: Array<[string, string]>;
}

function readMeasurements(snapshot: unknown): MeasurementSet | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const rec = snapshot as Record<string, unknown>;
  const inner =
    rec.measurements && typeof rec.measurements === 'object'
      ? (rec.measurements as Record<string, unknown>)
      : rec;
  const fields: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(inner)) {
    if (k === 'unit') continue;
    if (typeof v === 'number' || (typeof v === 'string' && v !== '')) {
      fields.push([humanize(k), String(v)]);
    }
  }
  if (fields.length === 0) return null;
  return { unit: typeof rec.unit === 'string' ? rec.unit : null, fields };
}

function hoursLeft(deadlineIso: string, nowMs: number): number {
  const ms = new Date(deadlineIso).getTime() - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 3_600_000);
}

export function VendorOrderConfirm({ order, chargesEnabled, now }: VendorOrderConfirmProps) {
  const router = useRouter();
  const [nowMs, setNowMs] = React.useState<number>(() => (now ?? new Date()).getTime());
  const [busy, setBusy] = React.useState<'confirm' | 'decline' | null>(null);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (now) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [now]);

  const pending = order.status === 'pending_confirmation';
  const pickup = order.fulfillmentType === 'pickup';
  const commission = order.commissionCents ?? computeCommissionCents(order.itemSubtotalCents);
  const payout = order.itemSubtotalCents - commission + order.shippingCents;
  const hours = hoursLeft(order.confirmDeadlineAt, nowMs);

  async function act(kind: 'confirm' | 'decline') {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${kind}`, { method: 'POST' });
      if (!res.ok) {
        setError(
          kind === 'confirm'
            ? 'We could not confirm this order. Please try again.'
            : 'We could not decline this order. Please try again.'
        );
        return;
      }
      setDeclineOpen(false);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const pieces = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-cream-soft">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Order from {order.vendorName}
          </h1>
          {pending && (
            <span className="rounded-full border border-hot-pink/25 bg-hot-pink/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-hot-pink">
              Needs your confirmation
            </span>
          )}
          {order.status === 'confirmed' && (
            <span className="rounded-full border border-indigo/25 bg-indigo/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo">
              Confirmed
            </span>
          )}
          {order.status === 'cancelled' && (
            <span className="rounded-full border border-hairline bg-cream px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Cancelled
            </span>
          )}
        </div>
        {pending && (
          <span className="rounded-lg border border-hairline bg-cream px-3 py-2 text-[13px] font-semibold text-ink">
            Respond within <b className="font-semibold text-indigo">{hours}h</b>
          </span>
        )}
      </div>

      {pending && (
        <p className="mx-6 mb-5 max-w-[68ch] text-sm leading-relaxed text-ink-muted">
          We&apos;ve <b className="font-semibold text-ink">authorized the buyer&apos;s payment</b>{' '}
          but not charged it. Confirm you can make it and we&apos;ll charge their card and start
          your payout. If you can&apos;t, decline and the hold is released, no charge.{' '}
          <b className="font-semibold text-ink">You have 48 hours.</b>
        </p>
      )}
      {order.status === 'confirmed' && (
        <p className="mx-6 mb-5 text-sm text-ink-muted">
          You confirmed this order. The buyer&apos;s card has been charged.
        </p>
      )}
      {order.status === 'cancelled' && (
        <p className="mx-6 mb-5 text-sm text-ink-muted">
          This order was not fulfilled. The hold was released and the buyer was not charged.
        </p>
      )}

      <div className="grid border-t border-hairline md:grid-cols-[1.6fr_1fr]">
        <div className="border-b border-hairline p-6 md:border-b-0 md:border-r">
          <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Order &middot; {pieces} {pieces === 1 ? 'piece' : 'pieces'}
          </p>
          <ul>
            {order.items.map((item) => {
              const mtm = item.customizationType === 'made_to_measure';
              const m = mtm ? readMeasurements(item.measurementSnapshot) : null;
              return (
                <li key={item.id} className="mb-4 border-b border-hairline-soft pb-4 last:border-0">
                  <div className="flex gap-3.5">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-[70px] w-14 flex-none rounded-md object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="h-[70px] w-14 flex-none rounded-md bg-cream"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-ink">{item.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-muted">
                        {mtm ? 'Made to measure' : 'Ready-made'}
                        {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                        {item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}
                      </p>
                    </div>
                    <span className="font-mono text-[13px] text-ink">
                      {formatPrice(item.unitPriceCents * item.quantity)}
                    </span>
                  </div>
                  {m && (
                    <div className="mt-3 rounded-lg border border-hairline-soft bg-cream p-4">
                      <div className="mb-3 flex items-baseline justify-between">
                        <span className="text-[12.5px] font-semibold text-ink">
                          Submitted measurements
                        </span>
                        {m.unit && <span className="text-xs text-ink-soft">{m.unit}</span>}
                      </div>
                      <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
                        {m.fields.map(([k, v]) => (
                          <div
                            key={k}
                            className="flex justify-between border-b border-dotted border-hairline pb-1 text-[12.5px]"
                          >
                            <dt className="text-ink-muted">{k}</dt>
                            <dd className="font-mono text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Fulfillment
          </p>
          <p className="text-[13.5px] text-ink-muted">
            <b className="font-semibold text-ink">
              {pickup ? 'Pickup at your boutique' : 'Ship to the buyer'}
            </b>
          </p>
          {!pickup && order.shippingAddress && (
            <address
              data-testid="vendor-ship-address"
              className="mt-2 text-[13.5px] not-italic leading-snug text-ink"
            >
              {order.shippingAddress.name && <div>{order.shippingAddress.name}</div>}
              {order.shippingAddress.address.line1 && (
                <div>{order.shippingAddress.address.line1}</div>
              )}
              {order.shippingAddress.address.line2 && (
                <div>{order.shippingAddress.address.line2}</div>
              )}
              <div>
                {[
                  order.shippingAddress.address.city,
                  order.shippingAddress.address.state,
                  order.shippingAddress.address.postal_code,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </div>
              {order.shippingAddress.address.country && (
                <div>{order.shippingAddress.address.country}</div>
              )}
            </address>
          )}
        </div>

        <div className="bg-cream p-5">
          <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Your payout
          </p>
          <div className="mb-4 rounded-lg border border-hairline p-4">
            <PayoutRow label="Item subtotal" value={formatPrice(order.itemSubtotalCents)} />
            <PayoutRow label="Baazar fee (10%)" value={`-${formatPrice(commission)}`} />
            <PayoutRow label="Shipping" value={formatPrice(order.shippingCents)} />
            <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-3 text-sm font-semibold text-ink">
              <span>Your payout</span>
              <span className="font-mono text-lg font-medium">{formatPrice(payout)}</span>
            </div>
            <p className="mt-2.5 text-[11.5px] leading-snug text-ink-soft">
              Sales tax is collected from the buyer and remitted separately. It isn&apos;t part of
              your payout.
            </p>
          </div>

          {pending && !chargesEnabled && (
            <div className="mb-4 flex gap-2 rounded-lg border border-indigo/20 bg-indigo/5 p-3 text-xs leading-relaxed text-ink-muted">
              <span aria-hidden="true" className="flex-none font-bold text-indigo">
                &#9670;
              </span>
              <span>
                You haven&apos;t finished <b className="text-ink">payout setup</b> yet. You can
                still confirm, we&apos;ll hold your earnings safely and release them the moment you
                connect Stripe.{' '}
                <Link
                  href="/dashboard/profile/payments"
                  className="font-semibold text-indigo underline"
                >
                  Set up payouts
                </Link>
              </span>
            </div>
          )}

          {pending && (
            <div>
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => void act('confirm')}
                className={cn(
                  'w-full bg-ink py-3.5 text-cream',
                  'hover:-translate-y-px hover:bg-hot-pink motion-reduce:hover:translate-y-0'
                )}
              >
                {busy === 'confirm' ? 'Confirming...' : "Confirm, I'll make this"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => setDeclineOpen(true)}
                className="mt-2.5 w-full text-ink-muted hover:border-error hover:text-error"
              >
                Can&apos;t fulfill this order
              </Button>
              <p className="mt-2 text-center text-[11.5px] leading-snug text-ink-soft">
                Releases the hold. The buyer won&apos;t be charged.
              </p>
              {error && (
                <p role="alert" className="mt-3 text-xs text-error">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title="Decline This Order?"
        description="This releases the hold on the buyer's card. They won't be charged, and this can't be undone."
        confirmLabel="Decline Order"
        cancelLabel="Keep Order"
        destructive
        busy={busy === 'decline'}
        onConfirm={() => act('decline')}
      />
    </div>
  );
}

function PayoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-[13px] text-ink-muted">
      <span>{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </div>
  );
}
