import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';

interface UpcomingEventCardProps {
  href: string;
  imageUrl?: string | null;
  title: string;
  subtitle: string;
  dateLabel: string;
}

export function UpcomingEventCard({
  href,
  imageUrl,
  title,
  subtitle,
  dateLabel,
}: UpcomingEventCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-2xl border border-hairline bg-white p-2 transition-colors hover:border-indigo/30"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-cream-soft">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <CalendarDays className="size-8 text-ink-soft/60" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-soft">{subtitle}</p>
        <p className="text-xs text-ink-muted">{dateLabel}</p>
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-indigo">
          View details
          <ArrowRight className="size-3" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
