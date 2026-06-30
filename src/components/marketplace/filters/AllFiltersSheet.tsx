'use client';

import * as React from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFilterState, serializeFilterState } from './use-filter-state';
import { TrustSection } from './sections/TrustSection';
import { PriceSection } from './sections/PriceSection';
import { LanguagesSection } from './sections/LanguagesSection';
import { ExperienceSection } from './sections/ExperienceSection';
import { CategorySpecificSection } from './sections/CategorySpecificSection';
import { fmtCount } from '@/lib/intl';

interface AllFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Side-drawer sheet (Vaul) containing all filter sections + sticky live-count footer.
 * Right edge on desktop, bottom on mobile (Vaul handles direction via prop).
 */
export function AllFiltersSheet({ open, onOpenChange }: AllFiltersSheetProps) {
  const { state, patch, reset, apply } = useFilterState();
  const searchParams = useSearchParams();
  const category = searchParams.get('category');

  const [count, setCount] = React.useState<number | null>(null);
  const [countLoading, setCountLoading] = React.useState(false);

  // Debounced live count — 300ms after last change.
  React.useEffect(() => {
    if (!open) return;
    setCountLoading(true);
    const t = setTimeout(async () => {
      const params = serializeFilterState(state);
      if (category) params.set('category', category);
      try {
        const res = await fetch(`/api/vendors/count?${params.toString()}`, { cache: 'no-store' });
        const data = (await res.json()) as { count?: number };
        setCount(data.count ?? 0);
      } catch {
        setCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state, open, category]);

  const handleApply = () => {
    apply();
    onOpenChange(false);
  };

  const handleClear = () => {
    reset();
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <Drawer.Content
          className={cn(
            'fixed bottom-0 right-0 top-0 z-50 w-full overscroll-contain bg-cream sm:w-[480px]',
            'flex flex-col shadow-[-12px_0_28px_rgba(27,20,20,0.10)]'
          )}
        >
          <Drawer.Title className="sr-only">All filters</Drawer.Title>
          <Drawer.Description className="sr-only">
            Refine vendor results by trust, price, languages, experience, event types, and
            category-specific options.
          </Drawer.Description>

          {/* Header */}
          <div className="flex items-center justify-between px-7 py-5 shadow-[0_1px_0_rgba(27,20,20,0.06),0_8px_12px_-12px_rgba(27,20,20,0.08)]">
            <h4 className="font-display text-[22px] font-bold tracking-[-0.012em] text-ink">
              All filters
            </h4>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close filters"
              className="inline-flex size-10 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:border-ink"
            >
              <X className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <TrustSection state={state} patch={patch} />
            <PriceSection state={state} patch={patch} />
            <LanguagesSection state={state} patch={patch} />
            <ExperienceSection state={state} patch={patch} />
            {/* EventTypesSection hidden until the served_event_types backing
                column is wired into applyVendorFilters (currently a no-op).
                Vendors do have data in served_event_types per Bucket J — what's
                missing is the query-side filter. Re-enable once that ships. */}
            <CategorySpecificSection category={category} state={state} patch={patch} />
          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between bg-cream px-7 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-1px_0_rgba(27,20,20,0.06),0_-8px_12px_-12px_rgba(27,20,20,0.08)]">
            <button
              type="button"
              onClick={handleClear}
              className="text-[13px] text-ink underline underline-offset-2 hover:text-ink-muted"
            >
              Clear all
            </button>
            <Button
              variant="primary"
              size="md"
              isLoading={countLoading}
              showTextWhileLoading={true}
              onClick={handleApply}
              disabled={count === 0}
              aria-live="polite"
              className="tabular-nums"
            >
              {countLoading
                ? 'Counting…'
                : count === 0
                  ? 'No matches'
                  : `Show ${count == null ? '—' : fmtCount(count)} vendors`}
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
