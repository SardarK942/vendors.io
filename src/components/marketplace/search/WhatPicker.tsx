'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { POPULAR_QUERIES } from './categories';

export interface WhatPickerProps {
  /** Current query value. */
  query: string;
  /** Called as the user types. */
  onChange: (q: string) => void;
  /** Called when a suggestion is clicked or Enter is pressed. */
  onSubmit: (q: string) => void;
}

/**
 * Free-text input + filtered popular-query suggestions.
 * Filter is case-insensitive substring match against POPULAR_QUERIES.
 */
export function WhatPicker({ query, onChange, onSubmit }: WhatPickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return POPULAR_QUERIES;
    return POPULAR_QUERIES.filter((p) => p.toLowerCase().includes(q));
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(query);
    }
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='"Bollywood DJ" or "Mehndi artist"…'
        aria-label="What are you looking for?"
        className={cn(
          'w-full rounded-sm border border-hairline bg-cream px-3.5 py-2.5',
          'font-sans text-[13px] text-ink',
          'placeholder:italic placeholder:text-ink-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
        )}
      />

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
      </p>

      {suggestions.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
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
      )}
    </div>
  );
}
