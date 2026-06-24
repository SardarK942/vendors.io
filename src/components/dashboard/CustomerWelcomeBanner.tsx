'use client';

import * as React from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

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
  const [dismissed, setDismissed] = React.useState(false);

  async function handleDismiss() {
    setDismissed(true);
    await fetch('/api/users/me/dismiss-welcome', { method: 'PATCH' }).catch(() => {});
  }

  if (dismissed) return <></>;

  return (
    <div className="mb-6 rounded-lg border border-ink/10 bg-cream p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {eventDate && formattedEventDate && daysUntilEvent !== null && (
            <p className="text-lg font-semibold text-ink">
              Your event is on {formattedEventDate} — that&apos;s {daysUntilEvent} days away.
            </p>
          )}

          {categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <Link
                  key={c}
                  href={`/vendors?category=${c}`}
                  className="rounded-full border border-ink/20 px-3 py-1 text-xs text-ink hover-pink-border"
                >
                  Browse {c}
                </Link>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-4 text-ink/40 hover:text-ink"
          aria-label="Dismiss welcome banner"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
