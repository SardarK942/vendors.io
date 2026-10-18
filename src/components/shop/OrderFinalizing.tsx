'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const POLL_MS = 2000;
const MAX_POLLS = 15;

/** Webhook-window pending state: refreshes the server page every ~2s for ~30s. */
export function OrderFinalizing() {
  const router = useRouter();
  const [polls, setPolls] = React.useState(0);
  const timedOut = polls >= MAX_POLLS;

  React.useEffect(() => {
    if (timedOut) return;
    const id = window.setTimeout(() => {
      router.refresh();
      setPolls((n) => n + 1);
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [polls, timedOut, router]);

  return (
    <main className="mx-auto max-w-[720px] px-4 py-16 md:py-24">
      <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
        Order placed
      </p>
      <h1 className="mb-[18px] font-display text-[34px] font-bold leading-[0.96] tracking-tight text-ink md:text-[42px]">
        {timedOut ? 'Still finalizing.' : 'Finalizing your order...'}
      </h1>
      <p role="status" className="max-w-[60ch] text-[16.5px] leading-[1.58] text-ink-muted">
        {timedOut
          ? 'This is taking longer than usual. If your order does not appear, an item may have just sold out. You have not been charged, and we have emailed you.'
          : 'Your payment hold went through. We are recording your order now, this only takes a moment.'}
      </p>
      <div className="mt-6 flex items-center gap-3">
        {!timedOut && (
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse rounded-full bg-haldi motion-reduce:animate-none"
          />
        )}
        <Link href="/shop" className="text-sm font-semibold text-indigo hover:text-hot-pink">
          Keep shopping
        </Link>
      </div>
    </main>
  );
}
