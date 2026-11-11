import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  icon?: LucideIcon;
  title: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}

export function SectionHeading({
  icon: Icon,
  title,
  actionLabel,
  actionHref,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-5 text-indigo" aria-hidden="true" /> : null}
        <h2 className="font-display text-lg text-ink">{title}</h2>
      </div>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 text-sm text-indigo hover-pink-text"
        >
          {actionLabel}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
