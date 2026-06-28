'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
 * Free-text input + filtered popular-query suggestions, wired into a cmdk
 * Command so the listbox gets proper ARIA + arrow-key nav for free.
 *
 * Filter is delegated to cmdk's built-in fuzzy matcher rather than our own
 * substring check, but visible behavior is equivalent for short query lists.
 */
export function WhatPicker({ query, onChange, onSubmit }: WhatPickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Only intercept if the user hasn't navigated into the listbox — cmdk
      // handles Enter on a highlighted item itself via onSelect.
      const root = (e.currentTarget.closest('[cmdk-root]') as HTMLElement | null) ?? null;
      const hasSelected = root?.querySelector('[cmdk-item][data-selected="true"]');
      if (!hasSelected) {
        e.preventDefault();
        onSubmit(query);
      }
    }
  };

  return (
    <Command className="w-full bg-transparent">
      <CommandPrimitive.Input
        ref={inputRef}
        value={query}
        onValueChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder='"Bollywood DJ" or "Mehndi artist"…'
        aria-label="What are you looking for?"
        className={cn(
          'w-full rounded-sm border border-hairline bg-cream px-3.5 py-2.5',
          'font-sans text-[13px] text-ink outline-none',
          'placeholder:italic placeholder:text-ink-soft',
          'focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
        )}
      />

      <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
        Popular
      </p>
      <CommandList>
        <CommandEmpty>
          <span className="text-[12px] italic text-ink-soft">
            No matches. Try a different phrase.
          </span>
        </CommandEmpty>
        <CommandGroup>
          {POPULAR_QUERIES.map((s) => (
            <CommandItem
              key={s}
              value={s}
              onSelect={(v) => onSubmit(v)}
              className="text-[12px] text-ink-muted data-[selected=true]:bg-cream-soft data-[selected=true]:text-ink"
            >
              {s}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
