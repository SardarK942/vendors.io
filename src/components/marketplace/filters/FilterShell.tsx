'use client';

import * as React from 'react';
import { AiSearchInput } from '../AiSearchInput';
import { FilterChipRow } from './FilterChipRow';
import { AllFiltersSheet } from './AllFiltersSheet';

interface FilterShellProps {
  /** Current search query (from URL ?q=) — prefills the AI search input. */
  initialQuery?: string;
}

/**
 * Sticky band on /vendors holding the AI search input AND the FilterChipRow.
 * Manages the AllFiltersSheet open state.
 */
export function FilterShell({ initialQuery }: FilterShellProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 mb-6 space-y-3 bg-cream/95 px-4 py-3 shadow-[0_1px_0_rgba(27,20,20,0.06),0_8px_12px_-12px_rgba(27,20,20,0.08)] backdrop-blur supports-[backdrop-filter]:bg-cream/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <AiSearchInput variant="sticky" defaultValue={initialQuery} className="max-w-[640px]" />
        <FilterChipRow onOpenSheet={() => setSheetOpen(true)} />
      </div>
      <AllFiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
