'use client';

import { cn } from '@/lib/utils';
import { getSubcategoriesForCategory } from '@/lib/vendor-subcategories';

interface Props {
  category: string | null | undefined;
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/**
 * Multi-select chip group for vendor subcategory tags. Renders one chip per
 * subcategory entry from SUBCATEGORIES_BY_CATEGORY. Returns null when the
 * given category has no taxonomy — callers don't have to guard.
 *
 * Selection order is preserved as-clicked (toggle in / toggle out). Callers
 * that need a stable shape should sort the array themselves.
 */
export function SubcategoryMultiSelect({ category, selected, onChange, className }: Props) {
  const options = getSubcategoriesForCategory(category);
  if (options.length === 0) return null;

  const toggle = (slug: string) => {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="group" aria-label="Subcategory">
      {options.map((opt) => {
        const isOn = selected.includes(opt.slug);
        return (
          <button
            type="button"
            key={opt.slug}
            aria-pressed={isOn}
            onClick={() => toggle(opt.slug)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              isOn
                ? 'border-ink bg-ink text-cream'
                : 'border-hairline bg-cream text-ink hover:border-ink'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
