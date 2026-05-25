'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGES } from './constants';

export interface LanguagesDropdownProps {
  /** Currently selected slugs (sorted). */
  selected: string[];
  /** Called when user toggles a language. Receives the next sorted array. */
  onChange: (next: string[]) => void;
}

/**
 * Multi-select languages picker panel that docks below the Languages chip.
 * Click toggles; chip row shows the count badge separately.
 */
export function LanguagesDropdown({ selected, onChange }: LanguagesDropdownProps) {
  const toggle = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug].sort();
    onChange(next);
  };

  return (
    <ul
      role="listbox"
      aria-multiselectable
      aria-label="Languages spoken"
      className="max-h-80 min-w-[220px] overflow-y-auto py-1"
    >
      {LANGUAGES.map((lang) => {
        const isSelected = selected.includes(lang.slug);
        return (
          <li key={lang.slug}>
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => toggle(lang.slug)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left',
                'text-[13px] text-ink transition-colors',
                'hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo',
                isSelected && 'bg-cream-soft font-medium'
              )}
            >
              <span>{lang.label}</span>
              {isSelected && <Check className="size-3.5 stroke-ink" strokeWidth={2.5} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
