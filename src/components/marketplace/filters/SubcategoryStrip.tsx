'use client';

import { getSubcategoriesForCategory, SUBCATEGORY_SECTION_LABEL } from '@/lib/vendor-subcategories';
import { cn } from '@/lib/utils';
import { useFilterState } from './use-filter-state';

/**
 * Inline subcategory drill-in, mounted under CategoryIconBar in FilterShell.
 * Appears ON the page the moment a category with a registered subcategory
 * taxonomy is active. Renders nothing otherwise (so the sticky band doesn't
 * grow for Video / Reels / DJ / etc.).
 *
 * Treatment is deliberately QUIETER than the category bar above it — a level
 * deeper, not a competing row. It borrows the category bar's own language
 * (muted text, hot-pink hover, ink + underline on select) rather than a
 * solid-ink pill, so it reads as parent -> child. An indigo section kicker
 * ("CART TYPE") on the left carries the parent relationship. No glyphs: the
 * category row owns the one glyph moment; the label text is already
 * unambiguous. See the #152 critique.
 *
 * Shares FilterState with the sheet: toggling here writes the same
 * ?subcategories= param via apply(), so the inline strip and the sheet's
 * subcategory section stay in sync. Multi-select; how multiple selections match
 * is per-category (ANY for "type" facets, ALL for "services offered" like hair
 * & makeup) and lives in applyVendorFilters, not here.
 */
export function SubcategoryStrip() {
  const { state, apply } = useFilterState();
  const category = state.category;
  const options = getSubcategoriesForCategory(category);
  if (options.length === 0) return null;

  const selected = state.subcategories;
  const heading = (category && SUBCATEGORY_SECTION_LABEL[category]) || 'Type';

  function toggle(slug: string) {
    const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug];
    apply({ subcategories: next.sort() });
  }

  return (
    <div
      role="group"
      aria-label={heading}
      className="flex items-center gap-x-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
        {heading}
      </span>
      {options.map((opt) => {
        const isOn = selected.includes(opt.slug);
        return (
          <button
            key={opt.slug}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(opt.slug)}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 pb-1 pt-1 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              isOn
                ? 'border-ink font-medium text-ink'
                : 'border-transparent text-ink-muted hover:text-hot-pink'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
