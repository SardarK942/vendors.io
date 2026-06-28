'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { fmtUSDWithCents, fmtDate } from '@/lib/intl';

interface FirstBookingCelebrationProps {
  vendorName: string;
  eventDate: string;
  totalCents: number;
  depositCents: number;
  responseSlaHours: number;
}

export function FirstBookingCelebration({
  vendorName,
  eventDate,
  totalCents,
  depositCents,
  responseSlaHours,
}: FirstBookingCelebrationProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  const handleDismiss = () => {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    router.replace(url.pathname + url.search);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="max-w-md">
        <h2 className="text-2xl font-bold text-ink">
          <span aria-hidden="true">🎉</span> Your first booking request is in!
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          {vendorName} · {fmtDate(`${eventDate}T12:00:00`)} ·{' '}
          <span className="tabular-nums">{fmtUSDWithCents(totalCents)}</span>
        </p>

        <div className="my-6 space-y-3 rounded-md border border-ink/10 bg-cream p-4">
          <p className="text-sm text-ink">
            <strong>1.</strong> {vendorName} reviews and responds within {responseSlaHours}
            {' '}hours.
          </p>
          <p className="text-sm text-ink">
            <strong>2.</strong> You’ll get an email when they accept or counter.
          </p>
          <p className="text-sm text-ink">
            <strong>3.</strong> Pay your 5% deposit ({fmtUSDWithCents(depositCents)}) to confirm and
            unlock their contact info.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="w-full rounded-md bg-ink py-3 font-medium text-cream transition hover:-translate-y-px hover:bg-hot-pink hover:shadow-pink motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Got it →
        </button>
      </DialogContent>
    </Dialog>
  );
}
