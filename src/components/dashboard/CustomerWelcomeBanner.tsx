'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, X } from 'lucide-react';

interface Props {
  eventDate: string | null;
  categories: string[];
  daysUntilEvent: number | null;
  formattedEventDate: string | null;
}

export function CustomerWelcomeBanner({
  eventDate,
  categories,
  daysUntilEvent,
  formattedEventDate,
}: Props): React.JSX.Element {
  // `show` drives the exit animation; `removed` fully unmounts the wrapper
  // after the animation completes so the dismissed banner takes zero layout
  // space (no residual margin).
  const [show, setShow] = React.useState(true);
  const [removed, setRemoved] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };
  const exitTransition = reducedMotion ? { duration: 0 } : { duration: 0.18 };

  async function handleDismiss() {
    setShow(false);
    await fetch('/api/users/me/dismiss-welcome', { method: 'PATCH' }).catch(() => {});
  }

  if (removed) return <></>;

  return (
    <AnimatePresence initial={false} onExitComplete={() => setRemoved(true)}>
      {show && (
        <motion.div
          className="mb-6 rounded-xl bg-indigo px-5 py-4 text-cream shadow-[0_14px_34px_-22px_rgba(46,61,163,0.9)]"
          role="region"
          aria-label="Welcome"
          aria-live="polite"
          exit={{ opacity: 0, y: -8, transition: exitTransition }}
        >
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-cream/15 sm:inline-flex"
            >
              <CalendarDays className="size-5 text-cream" />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              {eventDate && formattedEventDate && daysUntilEvent !== null && (
                <motion.p
                  className="text-balance text-sm font-medium text-cream"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring}
                >
                  Your event is on {formattedEventDate} — that’s {daysUntilEvent} days away.
                </motion.p>
              )}

              {categories.length > 0 && (
                <motion.div
                  className="flex flex-wrap gap-2 sm:ml-auto"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: reducedMotion ? 0 : 0.1 }}
                >
                  {categories.map((c) => (
                    <Link
                      key={c}
                      href={`/vendors?category=${c}`}
                      aria-label={`Browse ${c} vendors`}
                      className="rounded-md bg-cream/10 px-3 py-1.5 text-xs font-medium capitalize text-cream transition-colors hover:bg-cream/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-indigo"
                    >
                      Browse {c}
                    </Link>
                  ))}
                </motion.div>
              )}
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded text-cream/60 transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-indigo"
              aria-label="Dismiss welcome banner"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
