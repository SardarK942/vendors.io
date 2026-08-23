'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const DISMISSED_KEY = 'baazar_analytics_notice_dismissed';

// Purely informational — never gates analytics. PostHogProvider inits
// unconditionally at module scope regardless of whether this notice is
// shown, dismissed, or never mounted.
export function AnalyticsNotice() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1');
    setMounted(true);
  }, []);

  if (!mounted || dismissed) return null;

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    // z-40, strictly below the mobile BookingBottomBar's z-50
    // (.js-booking-bottom-bar in vendor-profile pages) — the booking CTA
    // must never be covered by this transient, dismissible notice.
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-cream px-4 py-3 text-ink shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-ink-muted">
          We use cookies &amp; analytics to improve Baazar.{' '}
          <Link href="/privacy" className="font-semibold text-ink underline hover:text-indigo">
            Learn more
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss analytics notice"
          className="shrink-0 rounded-full p-1 text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
