'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCloseToHome } from '@/lib/dashboard/useCloseToHome';
import { useIsMobile } from '@/lib/dashboard/use-is-mobile';

/**
 * Booking-detail side panel for the dashboard. Rendered as an intercepted
 * route slot (`@panel/(.)bookings/[id]`), so it overlays the underlying
 * /dashboard/bookings list without unmounting it.
 *
 * IMPORTANT: this is a page-route panel, NOT a modal dialog. Treat it as
 * `role="complementary"`:
 *   - The page behind stays interactive (focus can move there, links can be
 *     opened, browser-back navigates away).
 *   - No focus trap, no body scroll lock — those are modal-only concerns.
 *   - The backdrop "closes" the panel by navigating back via router; it's a
 *     real button for keyboard a11y, not a div with onClick.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const close = useCloseToHome();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();

  // `show` lets us defer the actual route close (router.back via `close`) until
  // the exit animation completes. Set false to play exit, then onExitComplete
  // navigates away.
  const [show, setShow] = useState(true);
  const handleClose = () => setShow(false);

  // Mobile redirect shim: PanelShell doesn't render below md:, so on mobile the
  // intercepted route would leave the user on /dashboard/bookings/[id] with an
  // invisible panel. Hand off to the standalone page instead.
  useEffect(() => {
    if (isMobile && params?.id) {
      router.replace(`/dashboard/bookings/${params.id}`);
    }
  }, [isMobile, params, router]);

  // ESC closes the panel (router.back via useCloseToHome).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Avoid flashing the panel UI on mobile before the redirect effect runs.
  if (isMobile) return null;

  const enterSpring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };
  const exitTransition = reducedMotion ? { duration: 0 } : { duration: 0.15 };

  return (
    <AnimatePresence initial={false} onExitComplete={close}>
      {show && (
        <>
          <motion.button
            key="panel-backdrop"
            type="button"
            onClick={handleClose}
            aria-label="Close booking detail panel"
            className="fixed inset-0 z-30 hidden cursor-default bg-black/30 md:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitTransition }}
            transition={enterSpring}
          />
          <motion.aside
            key="panel-aside"
            role="complementary"
            aria-label="Booking detail panel"
            className="fixed inset-y-0 right-0 z-40 hidden w-full max-w-xl flex-col border-l bg-background shadow-xl md:flex"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 12, opacity: 0, transition: exitTransition }}
            transition={enterSpring}
          >
            <motion.header
              className="flex items-center justify-between border-b px-4 py-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: reducedMotion ? 0 : 0.08 }}
            >
              <motion.h2
                className="text-sm font-semibold"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...enterSpring, delay: reducedMotion ? 0 : 0.16 }}
              >
                Booking details
              </motion.h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close panel"
                className="inline-flex size-10 items-center justify-center rounded transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.header>
            <motion.div
              className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: reducedMotion ? 0 : 0.16 }}
            >
              {children}
            </motion.div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
