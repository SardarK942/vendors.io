'use client';

import * as React from 'react';
import { Drawer } from 'vaul';
import { Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { findCategory } from './categories';
import { WhenPicker } from './WhenPicker';
import { CategoryPicker } from './CategoryPicker';
import { WhatPicker } from './WhatPicker';
import type { SearchState } from './use-search-state';

export interface MobileSearchSheetProps {
  state: SearchState;
  setDate: (d: string) => void;
  setCategory: (c: string) => void;
  setQuery: (q: string) => void;
  submit: (overrides?: Partial<SearchState>) => void;
}

type MobileSection = 'when' | 'category' | 'what' | null;

function formatDateShort(iso: string): string {
  if (!iso) return 'Pick a date';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Mobile collapsed bar that opens a Vaul bottom sheet with the 3 stacked pickers
 * + sticky Search button. Tap a section header to expand its picker inline.
 */
export function MobileSearchSheet({
  state,
  setDate,
  setCategory,
  setQuery,
  submit,
}: MobileSearchSheetProps) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<MobileSection>(null);

  const handleSubmit = () => {
    setOpen(false);
    submit();
  };

  const category = findCategory(state.category);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} shouldScaleBackground>
      <Drawer.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-full px-5 py-3',
            'border border-hairline bg-cream text-ink-muted',
            'text-[13px] transition-colors hover:bg-cream-soft'
          )}
          aria-label="Open search"
        >
          <Search className="h-4 w-4 stroke-ink" strokeWidth={2} aria-hidden="true" />
          Search Chicago weddings
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-50 rounded-t-lg bg-cream',
            'flex h-[75vh] flex-col'
          )}
        >
          {/* Drag handle */}
          <div className="mx-auto mb-1 mt-3 h-1 w-12 rounded-full bg-hairline" aria-hidden="true" />

          <Drawer.Title className="sr-only">Search vendors</Drawer.Title>
          <Drawer.Description className="sr-only">
            Search by date, category, and free text
          </Drawer.Description>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {/* When */}
            <MobileSection
              label="When"
              value={formatDateShort(state.date)}
              isPlaceholder={!state.date}
              expanded={expanded === 'when'}
              onToggle={() => setExpanded(expanded === 'when' ? null : 'when')}
            >
              <WhenPicker
                selected={state.date}
                onSelect={(d) => {
                  setDate(d);
                  setExpanded('category');
                }}
              />
            </MobileSection>

            {/* Category */}
            <MobileSection
              label="Category"
              value={category?.label ?? 'All vendors'}
              isPlaceholder={!state.category || state.category === 'all'}
              expanded={expanded === 'category'}
              onToggle={() => setExpanded(expanded === 'category' ? null : 'category')}
            >
              <CategoryPicker
                selected={state.category}
                onSelect={(c) => {
                  setCategory(c);
                  setExpanded('what');
                }}
              />
            </MobileSection>

            {/* What */}
            <MobileSection
              label="What are you looking for?"
              value={state.query || '"Bollywood DJ" or "Mehndi artist"…'}
              isPlaceholder={!state.query}
              expanded={expanded === 'what'}
              onToggle={() => setExpanded(expanded === 'what' ? null : 'what')}
            >
              <WhatPicker
                query={state.query}
                onChange={setQuery}
                onSubmit={(q) => {
                  setQuery(q);
                  setOpen(false);
                  // Override carries fresh value; setQuery's state update is async
                  submit({ query: q });
                }}
              />
            </MobileSection>
          </div>

          {/* Sticky footer */}
          <div className="border-t border-hairline bg-cream px-5 py-4">
            <Button variant="primary" size="lg" className="w-full" onClick={handleSubmit}>
              Search
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

interface MobileSectionProps {
  label: string;
  value: string;
  isPlaceholder: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function MobileSection({
  label,
  value,
  isPlaceholder,
  expanded,
  onToggle,
  children,
}: MobileSectionProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center justify-between px-4 py-3 text-left',
          'bg-cream transition-colors hover:bg-cream-soft'
        )}
      >
        <div className="flex flex-col items-start">
          <span className="mb-1 text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-ink">
            {label}
          </span>
          <span
            className={cn(
              'text-[13px] leading-tight',
              isPlaceholder ? 'italic text-ink-muted' : 'font-medium text-ink'
            )}
          >
            {value}
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 stroke-ink-muted transition-transform', expanded && 'rotate-180')}
          strokeWidth={2}
        />
      </button>
      {expanded && (
        <div className="border-t border-hairline bg-cream-soft px-4 py-3">{children}</div>
      )}
    </div>
  );
}
