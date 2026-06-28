'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { X } from 'lucide-react';
import { useCloseToHome } from '@/lib/dashboard/useCloseToHome';
import { useIsMobile } from '@/lib/dashboard/use-is-mobile';

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

  // ESC closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <>
      <div aria-hidden onClick={close} className="fixed inset-0 z-30 hidden bg-black/30 md:block" />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-40 hidden w-full max-w-xl flex-col border-l bg-background shadow-xl md:flex"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Booking details</h2>
          <button
            onClick={close}
            aria-label="Close panel"
            className="rounded p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </>
  );
}
