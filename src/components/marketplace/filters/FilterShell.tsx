'use client';

import * as React from 'react';
import { SearchBar } from '../SearchBar';
import { FilterChipRow } from './FilterChipRow';
import { AllFiltersSheet } from './AllFiltersSheet';

interface FilterShellProps {
  initialCategory?: string;
}

/**
 * Sticky band on /vendors holding the SearchBar (sticky-header variant) AND the
 * FilterChipRow. Manages the AllFiltersSheet open state.
 */
export function FilterShell({ initialCategory }: FilterShellProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 mb-6 space-y-3 border-b border-hairline bg-cream/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-cream/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SearchBar variant="sticky-header" initialCategory={initialCategory} />
        <FilterChipRow onOpenSheet={() => setSheetOpen(true)} />
      </div>
      <AllFiltersSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
