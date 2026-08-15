'use client';

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CustomRequestPanelProps {
  vendorSlug: string;
  interactive: boolean;
  onRequest: () => void;
}

/**
 * Full-width "custom quote" surface for vendors with no fixed packages. Mirrors
 * the PackageGrid custom-request card's language (Sparkles / "Tailored" motif,
 * dashed border, cream-soft) but laid out horizontally so it fills the content
 * column and reads as intentional rather than a lonely tile.
 */
export function CustomRequestPanel({
  vendorSlug,
  interactive,
  onRequest,
}: CustomRequestPanelProps) {
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-dashed border-ink-soft/60 bg-cream-soft p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
      <div className="flex shrink-0 items-center gap-3 sm:w-20 sm:flex-col sm:gap-2">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cream text-indigo ring-1 ring-hairline">
          <Sparkles className="size-6" aria-hidden="true" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-soft">
          Tailored
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hot-pink">
          Quote on request
        </p>
        <h2 className="mt-1.5 font-display text-xl font-bold text-ink">
          Every event is quoted custom
        </h2>
        <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
          No fixed packages &mdash; this vendor builds pricing around your date, guest count, and
          what you have in mind. Send the details and they&rsquo;ll come back with a quote.
        </p>
      </div>

      <div className="shrink-0">
        <Button asChild size="lg" disabled={!interactive} className="w-full sm:w-auto">
          <Link
            href={`/vendors/${vendorSlug}/request`}
            onClick={(e) => {
              e.preventDefault();
              onRequest();
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              Request a quote
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
