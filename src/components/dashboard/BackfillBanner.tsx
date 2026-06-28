'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, SlidersHorizontal } from 'lucide-react';

interface BackfillBannerProps {
  /** Whether the user's profile is missing any of the 3 new fields. */
  show: boolean;
}

/**
 * One-time banner shown to existing vendors who haven't filled in the 3 new
 * profile fields (languages, years_in_business, response_sla_hours). Dismissable;
 * dismissal POSTs to /api/users/me/dismiss-backfill.
 */
export function BackfillBanner({ show: initialShow }: BackfillBannerProps) {
  const [visible, setVisible] = React.useState(initialShow);

  if (!visible) return null;

  const dismiss = async () => {
    setVisible(false); // optimistic
    try {
      await fetch('/api/users/me/dismiss-backfill', { method: 'POST' });
    } catch {
      // silent — banner stays dismissed on this page load even if save failed
    }
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-hairline bg-cream-soft px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-full border border-hairline bg-cream">
          <SlidersHorizontal className="size-4 stroke-ink" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Complete your profile</p>
          <p className="text-xs text-ink-muted">
            Add languages, years in business, and response time so customers can find you.
          </p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <Link
          href="/dashboard/profile/setup/details?backfill=true"
          className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-cream transition-colors hover:bg-[#2A1E1E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          Add details
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-cream hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <X className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
