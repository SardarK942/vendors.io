'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';

export interface OrderConfirmationItem {
  id: string;
  name: string;
  variantLabel: string | null;
  unitPriceCents: number;
  quantity: number;
  customizationType: string | null;
  measurementSnapshot: unknown;
  imageUrl: string | null;
}

export interface OrderConfirmationOrder {
  id: string;
  status: 'pending_confirmation' | 'confirmed' | 'cancelled';
  vendorName: string;
  fulfillmentType: 'pickup' | 'ship';
  itemSubtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  confirmDeadlineAt: string;
  /** Stored commission (cents); falls back to a recompute when absent. */
  commissionCents?: number;
  /** Collected shipping address for ship orders. */
  shippingAddress?: {
    name: string | null;
    address: Record<string, string | null>;
  } | null;
  items: OrderConfirmationItem[];
}

interface OrderConfirmationProps {
  order: OrderConfirmationOrder;
  /** Injectable clock for tests; defaults to the real current time. */
  now?: Date;
}

function remainingLabel(deadlineIso: string, nowMs: number): string {
  const ms = new Date(deadlineIso).getTime() - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 'Confirmation window ending';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
}

function rise(step: number): React.CSSProperties {
  return { animationDelay: `${step * 80}ms` };
}

const REVEAL = 'motion-safe:animate-rise';

export function OrderConfirmation({ order, now }: OrderConfirmationProps) {
  const [nowMs, setNowMs] = React.useState<number>(() => (now ?? new Date()).getTime());
  React.useEffect(() => {
    if (now) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [now]);

  const pending = order.status === 'pending_confirmation';
  const pickup = order.fulfillmentType === 'pickup';
  const hasMtm = order.items.some((i) => i.customizationType === 'made_to_measure');
  const total = formatPrice(order.totalCents);

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10 md:py-14">
      <p
        className={cn(
          'mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo',
          REVEAL
        )}
        style={rise(0)}
      >
        {order.status === 'cancelled'
          ? 'Order cancelled'
          : pending
            ? 'Order placed'
            : 'Order confirmed'}
      </p>
      <h1
        className={cn(
          'mb-[18px] font-display text-[34px] font-bold leading-[0.96] tracking-tight text-ink md:text-[42px]',
          REVEAL
        )}
        style={rise(0)}
      >
        {order.status === 'cancelled' ? (
          <>This order was not fulfilled.</>
        ) : pending ? (
          <>
            Thank you.
            <br />
            We&apos;ve got it from here.
          </>
        ) : (
          <>
            It&apos;s confirmed.
            <br />
            {order.vendorName} is on it.
          </>
        )}
      </h1>

      <p
        className={cn('mb-6 max-w-[60ch] text-[16.5px] leading-[1.58] text-ink-muted', REVEAL)}
        style={rise(1)}
      >
        {order.status === 'cancelled' ? (
          <>Any hold on your card has been released. You were not charged.</>
        ) : pending ? (
          <>
            We placed a <b className="font-semibold text-ink">hold</b> on your card for{' '}
            <b className="font-mono font-medium text-ink">{total}</b>. You haven&apos;t been charged
            yet. <b className="font-semibold text-ink">{order.vendorName}</b> has{' '}
            <b className="font-semibold text-ink">48 hours</b> to confirm they can make this for
            you. The moment they do, we charge the hold and email you; if they can&apos;t, the hold
            is released.
          </>
        ) : (
          <>
            {order.vendorName} confirmed your order and your card was charged{' '}
            <b className="font-mono font-medium text-ink">{total}</b>.
          </>
        )}
      </p>

      {pending && (
        <div className={REVEAL} style={rise(1)}>
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-cream-soft px-4 py-2 text-[13px] font-semibold text-ink"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-haldi" />
            Awaiting {order.vendorName}&apos;s confirmation &middot;{' '}
            <span suppressHydrationWarning>{remainingLabel(order.confirmDeadlineAt, nowMs)}</span>
          </span>
        </div>
      )}

      {order.status !== 'cancelled' && (
        <section className={REVEAL} style={rise(2)}>
          <h2 className="mb-5 mt-11 font-display text-[19px] font-semibold tracking-tight text-ink">
            What happens next
          </h2>
          <ol>
            <TimelineStep
              state="done"
              title="Order placed and hold authorized"
              sub="Your card is held, not charged"
            />
            <TimelineStep
              state={pending ? 'now' : 'done'}
              title={`${order.vendorName} confirms, within 48 hours`}
              sub="We charge the hold and lock in your order. You'll get an email."
            />
            <TimelineStep
              state={pending ? 'next' : 'now'}
              last
              title={`${hasMtm ? 'Made to measure, then ' : 'Prepared, then '}${
                pickup ? 'ready for pickup' : 'shipped to you'
              }`}
              sub={pickup ? 'Pickup at the boutique' : 'Shipped to your address'}
            />
          </ol>
        </section>
      )}

      <section className={REVEAL} style={rise(3)}>
        <h2 className="mb-5 mt-11 font-display text-[19px] font-semibold tracking-tight text-ink">
          Your order
        </h2>
        <div className="overflow-hidden rounded-lg border border-hairline bg-cream">
          <header className="flex items-baseline justify-between border-b border-hairline-soft px-[22px] py-[18px]">
            <span className="font-display text-[19px] font-semibold text-ink">
              {order.vendorName}
            </span>
            <span className="text-xs font-semibold text-indigo">
              {pickup ? 'Pickup' : 'Shipping'}
            </span>
          </header>
          <div className="px-[22px] pb-5 pt-1">
            <ul>
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-4 border-b border-hairline-soft py-4 last:border-b-0"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-[66px] w-[52px] flex-none rounded-md object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-[66px] w-[52px] flex-none rounded-md bg-cream-soft"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold text-ink">{item.name}</p>
                    <p className="mt-1 text-[12.5px] text-ink-muted">
                      {item.customizationType === 'made_to_measure'
                        ? 'Made to measure'
                        : item.variantLabel}
                      {item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}
                    </p>
                    {item.customizationType === 'made_to_measure' &&
                      item.measurementSnapshot != null && (
                        <p className="mt-2 text-xs font-medium text-ink-muted">
                          <span className="font-semibold text-indigo">Measurements locked in</span>
                        </p>
                      )}
                  </div>
                  <p className="whitespace-nowrap pt-0.5 font-mono text-[13px] text-ink">
                    {formatPrice(item.unitPriceCents * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="border-t border-hairline-soft pt-4 text-[13.5px] text-ink-muted">
              <TotalRow label="Subtotal" value={formatPrice(order.itemSubtotalCents)} />
              <TotalRow
                label={pickup ? 'Pickup' : 'Shipping'}
                value={order.shippingCents === 0 ? 'Free' : formatPrice(order.shippingCents)}
              />
              <TotalRow label="Estimated tax" value={formatPrice(order.taxCents)} />
              <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-[15px] text-[15px] font-semibold text-ink">
                <dt className="flex flex-col gap-0.5">
                  <span>
                    {pending
                      ? 'Total on hold'
                      : order.status === 'cancelled'
                        ? 'Total'
                        : 'Total charged'}
                  </span>
                  {pending && (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
                      Not yet charged
                    </span>
                  )}
                </dt>
                <dd className="font-mono text-[19px] font-medium">{total}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className={cn('mt-8 flex flex-col gap-3 sm:flex-row', REVEAL)} style={rise(4)}>
        <Button asChild variant="secondary" size="lg" className="flex-1">
          <Link href="/shop">Keep shopping</Link>
        </Button>
        <Button asChild variant="primary" size="lg" className="flex-1">
          <Link href="/orders">View your orders &rarr;</Link>
        </Button>
      </div>
    </main>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-[5px]">
      <dt>{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}

function TimelineStep({
  state,
  title,
  sub,
  last,
}: {
  state: 'done' | 'now' | 'next';
  title: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <li className={cn('relative flex gap-[18px]', !last && 'pb-6')}>
      <div className="relative flex w-4 flex-none justify-center">
        <span
          aria-hidden="true"
          className={cn(
            'z-10 mt-[3px] h-[13px] w-[13px] rounded-full',
            state === 'done' && 'bg-indigo',
            state === 'now' &&
              'border-[3px] border-indigo bg-cream shadow-[0_0_0_4px] shadow-indigo/10',
            state === 'next' && 'border-2 border-hairline bg-cream'
          )}
        />
        {!last && (
          <span aria-hidden="true" className="absolute -bottom-2 top-4 w-0.5 bg-hairline-soft" />
        )}
      </div>
      <div>
        <p
          className={cn(
            'text-[15px] font-semibold',
            state === 'next' ? 'text-ink-soft' : 'text-ink'
          )}
        >
          {title}
        </p>
        <p className="mt-1 text-[13px] leading-normal text-ink-muted">{sub}</p>
      </div>
    </li>
  );
}
