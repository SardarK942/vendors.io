'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  const reducedMotion = useReducedMotion();
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };
  const stagger = (i: number) => ({
    ...spring,
    delay: reducedMotion ? 0 : i * 0.1,
  });

  const handleDismiss = () => {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    router.replace(url.pathname + url.search);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <DialogContent className="max-w-md">
        <motion.h2
          className="text-balance text-2xl font-bold text-ink"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(0)}
        >
          <span aria-hidden="true">🎉</span> Your first booking request is in!
        </motion.h2>
        <motion.p
          className="mt-2 text-sm text-ink/70"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(1)}
        >
          {vendorName} · {fmtDate(`${eventDate}T12:00:00`)} ·{' '}
          <span className="tabular-nums">{fmtUSDWithCents(totalCents)}</span>
        </motion.p>

        <motion.div
          className="my-6 space-y-3 rounded-md border border-ink/10 bg-cream p-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
        >
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
        </motion.div>

        <motion.button
          type="button"
          onClick={handleDismiss}
          className="w-full rounded-md bg-ink py-3 font-medium text-cream transition-[transform,background-color,box-shadow] hover:-translate-y-px hover:bg-hot-pink hover:shadow-pink active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(3)}
        >
          Got it →
        </motion.button>
      </DialogContent>
    </Dialog>
  );
}
