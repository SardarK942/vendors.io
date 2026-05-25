'use client';

/**
 * HoverExpand pattern adapted from Skiper UI 52 HoverExpand_001 (https://skiper-ui.com).
 * Original by @gurvinder-singh02 / @Gur__vi.
 * Adapted to M+ design tokens + Baazar's 11 featured vendor categories.
 *
 * Renders only at lg: breakpoint and up. Mobile uses CategoryHoverExpandMobile.
 */

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { FeaturedCategory } from '@/lib/vendor-categories/featured';

export interface CategoryHoverExpandProps {
  categories: readonly FeaturedCategory[];
  /** Vendor counts per slug — server-provided. Zero counts trigger "Coming Soon". */
  counts: Record<string, number>;
}

function plural(label: string): string {
  if (label.endsWith('y')) return label.slice(0, -1) + 'ies';
  return label + 's';
}

export function CategoryHoverExpand({ categories, counts }: CategoryHoverExpandProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const reducedMotion = useReducedMotion();

  return (
    <div
      role="region"
      aria-label="Browse vendors by category"
      className="mx-auto hidden w-full max-w-[1280px] gap-1.5 px-6 py-12 lg:flex"
    >
      {categories.map((cat, i) => {
        const isActive = i === activeIndex;
        const count = counts[cat.slug] ?? 0;
        const isComingSoon = cat.comingSoon || count === 0;
        const href = `/vendors?category=${cat.slug}`;
        const motionTransition = reducedMotion
          ? { duration: 0 }
          : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

        return (
          <motion.div
            key={cat.slug}
            initial={false}
            animate={{
              flex: isActive ? '1 1 26rem' : '0 0 4rem',
            }}
            transition={motionTransition}
            className="relative h-[26rem] overflow-hidden rounded-lg"
            onMouseEnter={() => setActiveIndex(i)}
          >
            <Link
              href={href}
              aria-current={isActive ? 'true' : undefined}
              aria-label={`${cat.label} category`}
              className="absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              onClick={(e) => {
                // First interaction on a collapsed tile = expand only; don't navigate.
                // Click on the already-active tile = navigate.
                if (!isActive) {
                  e.preventDefault();
                  setActiveIndex(i);
                }
              }}
            >
              <Image
                src={cat.photoUrl}
                alt={cat.alt}
                fill
                sizes="(min-width: 1024px) 26rem, 100vw"
                className="object-cover"
                priority={i < 3}
              />

              {/* Dark wash when inactive (drops on active) */}
              <div
                className={`duration-[320ms] absolute inset-0 bg-ink/45 transition-opacity ${
                  isActive ? 'opacity-0' : 'opacity-100'
                }`}
              />

              {/* Bottom gradient when active (for content readability) */}
              <div
                className={`duration-[320ms] absolute inset-0 bg-gradient-to-t from-ink/[0.78] to-transparent transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Collapsed-state rotated label */}
              <span
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-cream transition-opacity duration-200 ${
                  isActive ? 'opacity-0' : 'opacity-100'
                }`}
              >
                {cat.label}
              </span>

              {/* Active-state content overlay */}
              <div
                className={`duration-[320ms] absolute bottom-0 left-0 right-0 p-6 text-cream transition-opacity delay-100 ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {isComingSoon ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                        {cat.kicker}
                      </span>
                      <span className="rounded-full bg-ink-soft/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cream">
                        Joining soon
                      </span>
                    </div>
                    <h3 className="m-0 mb-1 font-serif text-[28px] font-bold leading-tight tracking-[-0.012em]">
                      {cat.label}
                    </h3>
                    <p className="m-0 mb-3 text-sm text-cream/85">
                      Vendors are joining the platform.
                    </p>
                    <a
                      href="#newsletter"
                      className="inline-flex items-center gap-2 rounded-full bg-cream/[0.16] px-3.5 py-2 text-sm font-semibold text-cream backdrop-blur-sm hover:bg-cream/25"
                      onClick={(e) => {
                        e.preventDefault();
                        document.querySelector('footer')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      Get notified <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </>
                ) : (
                  <>
                    <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-haldi">
                      {cat.kicker}
                    </p>
                    <h3 className="m-0 mb-1 font-serif text-[28px] font-bold leading-tight tracking-[-0.012em]">
                      {cat.label}
                    </h3>
                    <p className="m-0 mb-3 text-sm text-cream/85">
                      {count} {plural(cat.label.toLowerCase())} in Chicago
                    </p>
                    <span className="inline-flex items-center gap-2 rounded-full bg-cream/[0.16] px-3.5 py-2 text-sm font-semibold text-cream backdrop-blur-sm">
                      Browse {cat.label.toLowerCase()}{' '}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </>
                )}
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
