'use client';

import { getSubcategoriesForCategory, SUBCATEGORY_SECTION_LABEL } from '@/lib/vendor-subcategories';
import { getSubcategoryIcon } from '@/lib/vendor-subcategory-visual';
import { cn } from '@/lib/utils';
import { useFilterState } from './use-filter-state';

/**
 * Inline subcategory drill-in, mounted under CategoryIconBar in FilterShell.
 * Appears ON the page the moment a category with a registered subcategory
 * taxonomy is active — no need to open the All-filters sheet. Renders nothing
 * otherwise (so the sticky band doesn't grow for Video / Reels / DJ / etc.).
 *
 * Shares FilterState with the sheet: toggling here writes the same
 * ?subcategories= param via apply(), so the inline strip and the sheet's
 * "Cart type" section stay perfectly in sync. Multi-select, matching the
 * AND-membership subcategory filter.
 */
export function SubcategoryStrip() {
  const { state, apply } = useFilterState();
  const category = state.category;
  const options = getSubcategoriesForCategory(category);
  if (options.length === 0) return null;

  const selected = state.subcategories ?? [];
  const heading = (category && SUBCATEGORY_SECTION_LABEL[category]) || 'Type';

  function toggle(slug: string) {
    const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug];
    apply({ subcategories: next.sort() });
  }

  return (
    <div
      role="group"
      aria-label={heading}
      className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((opt) => {
        const isOn = selected.includes(opt.slug);
        const Icon = getSubcategoryIcon(opt.slug);
        return (
          <button
            key={opt.slug}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(opt.slug)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              isOn
                ? 'border-ink bg-ink text-cream'
                : 'border-hairline bg-cream text-ink hover:border-hot-pink hover:text-hot-pink'
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
