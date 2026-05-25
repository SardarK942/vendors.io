'use client';
import * as React from 'react';

interface Props {
  category: string | null;
}

/**
 * Conditional section — only renders when search pill has a Category set.
 * UI placeholder for Day-1; per-category content (Photography style, Mehndi style,
 * etc.) ships as follow-up PRs as backing data lands.
 */
export function CategorySpecificSection({ category }: Props) {
  if (!category || category === 'all') return null;
  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-1 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        More about {category}
      </h5>
      <p className="text-[11px] text-ink-soft">
        Style, dietary options, music genres, and other category-specific filters coming soon.
      </p>
    </section>
  );
}
