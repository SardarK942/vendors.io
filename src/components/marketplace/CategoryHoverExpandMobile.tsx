'use client';

/**
 * Mobile treatment for CategoryHoverExpand. Renders below lg:.
 * A full-bleed, horizontally swipeable rail of tall portrait "slats" — the same
 * vertical-slat identity as the desktop strip, translated to a snap carousel so
 * the next card peeks and invites a swipe. Native scroll-snap; no JS.
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

export function CategoryHoverExpandMobile({ categories, counts }: CategoryHoverExpandMobileProps) {
  return (
    <div
      role="region"
      aria-label="Browse vendors by category"
      className="mx-[calc(50%-50vw)] w-screen py-6 lg:hidden"
    >
      <div
        className={[
          'flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth',
          'scroll-px-5 px-5 pb-4',
          'overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none]',
          '[&::-webkit-scrollbar]:hidden',
        ].join(' ')}
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
              className="group relative aspect-[3/4] w-[68vw] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              <Image
                src={cat.photoUrl}
                alt={cat.alt}
                fill
                sizes="(max-width: 1024px) 68vw, 280px"
                className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              />

              {/* Readability wash — a touch heavier at the base for the text. */}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/[0.82] via-ink/25 to-ink/10" />

              <div className="absolute inset-x-0 bottom-0 p-4 text-cream">
                {isComingSoon ? (
                  <>
                    <span className="mb-2 inline-flex rounded-full bg-cream/[0.18] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm">
                      Joining soon
                    </span>
                    <h3 className="m-0 font-serif text-xl font-bold leading-tight tracking-[-0.012em]">
                      {cat.label}
                    </h3>
                    <p className="m-0 mt-1 text-xs text-cream/85">Vendors are joining.</p>
                  </>
                ) : (
                  <>
                    <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-haldi">
                      {cat.kicker}
                    </p>
                    <h3 className="m-0 font-serif text-xl font-bold leading-tight tracking-[-0.012em]">
                      {cat.label}
                    </h3>
                    <p className="m-0 mt-1 text-xs tabular-nums text-cream/80">
                      {fmtCount(count)} vendor{count === 1 ? '' : 's'} in Chicago
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-cream/[0.16] px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors group-active:bg-cream/25">
                      Browse {cat.label.toLowerCase()}
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </>
                )}
              </div>
            </Link>
          );
        })}

        {/* Trailing spacer so the last card can snap flush to the left edge. */}
        <div aria-hidden className="w-2 shrink-0" />
      </div>
    </div>
  );
}
