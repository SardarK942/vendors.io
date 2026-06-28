'use client';

import * as React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
 * so this panel renders suggestions only, no second input field. Uses cmdk
 * under the hood for proper listbox ARIA + arrow-key nav.
 *
 * The composite WhatPicker — input + suggestions in one — is still used by
 * the mobile sheet, where there's no segment/panel separation.
 */
export function WhatSuggestions({ query, onSubmit }: WhatSuggestionsProps) {
  // We can't pull cmdk's input into this panel (it lives in SearchBar), so we
  // drive the filter directly via the `value` prop and hide the built-in input.
  return (
    <Command value={query} className="bg-transparent" shouldFilter={true}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
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
