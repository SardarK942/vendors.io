'use client';

/**
 * Mobile fallback for CategoryHoverExpand. Renders below lg: breakpoint.
 * 2-col grid of square cards (no animation). Same data shape.
 */

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { FeaturedCategory } from '@/lib/vendor-categories/featured';
import { fmtCount } from '@/lib/intl';

export interface CategoryHoverExpandMobileProps {
  categories: readonly FeaturedCategory[];
  counts: Record<string, number>;
}

function plural(label: string): string {
  if (label.endsWith('y')) return label.slice(0, -1) + 'ies';
  return label + 's';
}

export function CategoryHoverExpandMobile({ categories, counts }: CategoryHoverExpandMobileProps) {
  return (
    <div
      role="region"
      aria-label="Browse vendors by category"
      className="mx-auto grid w-full max-w-[640px] grid-cols-1 gap-3 px-6 py-8 sm:grid-cols-2 lg:hidden"
    >
      {categories.map((cat) => {
        const count = counts[cat.slug] ?? 0;
        const isComingSoon = cat.comingSoon || count === 0;
        const href = `/vendors?category=${cat.slug}`;

        return (
          <Link
            key={cat.slug}
            href={href}
            aria-label={`${cat.label} category`}
            className="group relative block aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <Image
              src={cat.photoUrl}
              alt={cat.alt}
              fill
              sizes="(max-width: 640px) 100vw, 320px"
              className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/[0.78] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-cream">
              {isComingSoon ? (
                <>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="rounded-full bg-ink-soft/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                      Joining soon
                    </span>
                  </div>
                  <h3 className="m-0 font-serif text-lg font-bold leading-tight tracking-[-0.012em]">
                    {cat.label}
                  </h3>
                </>
              ) : (
                <>
                  <p className="m-0 mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-haldi">
                    {cat.kicker}
                  </p>
                  <h3 className="m-0 mb-0.5 font-serif text-lg font-bold leading-tight tracking-[-0.012em]">
                    {cat.label}
                  </h3>
                  <p className="m-0 mb-2 text-xs tabular-nums text-cream/85">
                    {fmtCount(count)} in Chicago
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold">
                    Browse {plural(cat.label.toLowerCase())}{' '}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
