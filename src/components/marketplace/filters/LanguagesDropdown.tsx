'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { LANGUAGES } from './constants';

export interface LanguagesDropdownProps {
  /** Currently selected slugs (sorted). */
  selected: string[];
  /** Called when user toggles a language. Receives the next sorted array. */
  onChange: (next: string[]) => void;
}

/**
 * Multi-select languages picker panel that docks below the Languages chip.
 * Backed by cmdk for keyboard arrow nav + proper listbox/option ARIA.
 * Click (or Enter) toggles; chip row shows the count badge separately.
 */
export function LanguagesDropdown({ selected, onChange }: LanguagesDropdownProps) {
  const toggle = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug].sort();
    onChange(next);
  };

  return (
    <Command className="min-w-[220px] bg-transparent" label="Languages spoken" shouldFilter={false}>
      <CommandList className="max-h-80">
        <CommandGroup>
          {LANGUAGES.map((lang) => {
            const isSelected = selected.includes(lang.slug);
            return (
              <CommandItem
                key={lang.slug}
                value={lang.slug}
                onSelect={() => toggle(lang.slug)}
                aria-selected={isSelected}
                className={cn(
                  'justify-between gap-3 rounded-sm px-3 py-2 text-[13px] text-ink',
                  'data-[selected=true]:bg-cream-soft data-[selected=true]:text-ink',
                  isSelected && 'bg-cream-soft font-medium'
                )}
              >
                <span>{lang.label}</span>
                {isSelected && <Check className="size-3.5 stroke-ink" strokeWidth={2.5} />}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
