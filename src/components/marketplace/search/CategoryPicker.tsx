'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { CATEGORIES } from './categories';

export interface CategoryPickerProps {
  /** Currently selected category slug. Empty string or 'all' = no filter. */
  selected: string;
  /** Called when user picks a category. Receives the slug. */
  onSelect: (slug: string) => void;
}

/**
 * Vertical list of vendor categories with icons. Single-select.
 * Renders inside a panel docked below the Category segment. Backed by cmdk
 * for keyboard arrow nav + proper listbox/option ARIA.
 */
export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <Command className="max-h-80 bg-transparent" label="Vendor category" shouldFilter={false}>
      <CommandList className="max-h-80">
        <CommandGroup>
          {CATEGORIES.map((cat) => {
            const isSelected = selected === cat.slug || (!selected && cat.slug === 'all');
            const Icon = cat.icon;
            return (
              <CommandItem
                key={cat.slug}
                value={cat.slug}
                onSelect={() => onSelect(cat.slug)}
                className={cn(
                  'gap-3 rounded-sm px-3 py-2.5 text-[13px] text-ink',
                  'data-[selected=true]:bg-cream-soft data-[selected=true]:text-ink',
                  isSelected && 'bg-cream-soft font-medium'
                )}
                aria-selected={isSelected}
              >
                <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-hairline-soft">
                  <Icon className="h-3.5 w-3.5 stroke-ink" strokeWidth={2} />
                </span>
                {cat.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
