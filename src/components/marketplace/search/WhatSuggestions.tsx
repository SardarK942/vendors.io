'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { POPULAR_QUERIES } from './categories';

export interface WhatSuggestionsProps {
  /** Current query (used to filter the popular list). */
  query: string;
  /** Called when a suggestion is clicked. Receives the suggestion text. */
  onSubmit: (q: string) => void;
}

/**
 * Filtered popular-query suggestions for the What segment's docked panel.
 *
 * Pairs with the input that lives inline INSIDE the segment (see SearchBar) —
 * so this panel renders suggestions only, no second input field.
 *
 * (The composite WhatPicker — input + suggestions in one — is still used by
 * the mobile sheet, where there's no segment/panel separation.)
 */
export function WhatSuggestions({ query, onSubmit }: WhatSuggestionsProps) {
  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POPULAR_QUERIES;
    return POPULAR_QUERIES.filter((p) => p.toLowerCase().includes(q));
  }, [query]);

  if (suggestions.length === 0) {
    return (
      <p className="px-2.5 py-3 text-[12px] italic text-ink-soft">
        No matches. Try a different phrase.
      </p>
    );
  }

  return (
    <>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
        Popular
      </p>
      <ul className="space-y-0.5">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onSubmit(s)}
              className={cn(
                'w-full rounded-sm px-2.5 py-1.5 text-left text-[12px] text-ink-muted',
                'transition-colors hover:bg-cream-soft hover:text-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo'
              )}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
