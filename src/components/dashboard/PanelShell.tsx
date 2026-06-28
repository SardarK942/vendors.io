'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Avoid flashing the panel UI on mobile before the redirect effect runs.
  if (isMobile) return null;

  return (
    <>
      <button
        type="button"
        onClick={close}
        aria-label="Close booking detail panel"
        className="fixed inset-0 z-30 hidden cursor-default bg-black/30 md:block"
      />
      <aside
        role="complementary"
        aria-label="Booking detail panel"
        className="fixed inset-y-0 right-0 z-40 hidden w-full max-w-xl flex-col border-l bg-background shadow-xl md:flex"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Booking details</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close panel"
            className="rounded p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </aside>
    </>
  );
}
