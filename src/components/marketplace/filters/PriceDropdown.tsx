'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { PRICE_BANDS, type PriceBand } from './constants';

export interface PriceDropdownProps {
  /** Currently selected band, or null for unset. */
  selected: PriceBand | null;
  /** Called when user picks a band. */
  onSelect: (band: PriceBand | null) => void;
}

/**
 * Price-band picker panel that docks below the Price chip in the chip row.
 * Single-select (clicking the active band clears the selection). Backed by
 * cmdk for keyboard arrow nav + proper listbox/option ARIA.
 */
export function PriceDropdown({ selected, onSelect }: PriceDropdownProps) {
  return (
    <Command className="min-w-[200px] bg-transparent" label="Price band" shouldFilter={false}>
      <CommandList className="max-h-80">
        <CommandGroup>
          {PRICE_BANDS.map((band) => {
            const isSelected = selected === band.slug;
            return (
              <CommandItem
                key={band.slug}
                value={band.slug}
                onSelect={() => onSelect(isSelected ? null : band.slug)}
                aria-selected={isSelected}
                className={cn(
                  'justify-between gap-3 rounded-sm px-3 py-2 text-[13px] text-ink',
                  'data-[selected=true]:bg-cream-soft data-[selected=true]:text-ink',
                  isSelected && 'bg-cream-soft font-medium'
                )}
              >
                <span>{band.label}</span>
                <span className="text-[12px] tabular-nums text-ink-muted">{band.shorthand}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
