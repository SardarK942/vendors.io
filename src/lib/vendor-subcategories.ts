/**
 * Subcategory taxonomy keyed by vendor_profiles.category slug.
 * First consumer: carts. Add new categories here as demand surfaces — no
 * migration needed since vendor_profiles.subcategories is a generic text[].
 *
 * App-layer validation (validSubcategorySlugs) is the source of truth for
 * which slugs are accepted by the wizard, dashboard form, and marketplace
 * URL params. There is no DB CHECK constraint on subcategory values.
 */

export interface Subcategory {
  /** Snake_case slug stored in vendor_profiles.subcategories[]. */
  slug: string;
  /** Display label shown in chip groups, filter chips, and option lists. */
  label: string;
}

export const SUBCATEGORIES_BY_CATEGORY: Record<string, readonly Subcategory[]> = {
  carts: [
    { slug: 'dessert', label: 'Dessert cart' },
    { slug: 'beverage', label: 'Beverage cart' },
    { slug: 'appetizer', label: 'Appetizer cart' },
    { slug: 'favor_gift', label: 'Favor / gift cart' },
  ],
};

/** Heading text shown in the marketplace filter sheet's subcategory section. */
export const SUBCATEGORY_SECTION_LABEL: Record<string, string> = {
  carts: 'Cart type',
};

export function getSubcategoriesForCategory(
  category: string | null | undefined
): readonly Subcategory[] {
  if (!category) return [];
  return SUBCATEGORIES_BY_CATEGORY[category] ?? [];
}

export function validSubcategorySlugs(category: string): Set<string> {
  return new Set(getSubcategoriesForCategory(category).map((s) => s.slug));
}
