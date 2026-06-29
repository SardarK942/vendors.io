'use client';

import { getSubcategoriesForCategory, SUBCATEGORY_SECTION_LABEL } from '@/lib/vendor-subcategories';
import { SubcategoryMultiSelect } from '@/components/onboarding/SubcategoryMultiSelect';
import type { FilterState } from '../use-filter-state';

interface Props {
  category: string | null;
  state: FilterState;
  patch: (changes: Partial<FilterState>) => void;
}

/**
 * Conditional section — renders only when the active category has a
 * subcategory taxonomy registered in SUBCATEGORIES_BY_CATEGORY. Day 1:
 * carts only. Selection is staged into local FilterState via patch() and
 * commits when the sheet's Apply footer fires (existing flow).
 *
 * Reuses SubcategoryMultiSelect (the wizard + dashboard chip group) so the
 * chip styling stays in one place. Sorts on update for stable URL output.
 */
export function CategorySpecificSection({ category, state, patch }: Props) {
  const options = getSubcategoriesForCategory(category);
  if (options.length === 0) return null;

  const heading = (category && SUBCATEGORY_SECTION_LABEL[category]) || 'Type';

  return (
    <section className="border-b border-hairline px-7 py-5">
      <h5 className="mb-3 font-display text-[14px] font-bold tracking-[-0.005em] text-ink">
        {heading}
      </h5>
      <SubcategoryMultiSelect
        category={category}
        selected={state.subcategories ?? []}
        onChange={(next) => patch({ subcategories: [...next].sort() })}
      />
    </section>
  );
}
