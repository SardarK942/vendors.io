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
  photography: [
    { slug: 'wedding_day', label: 'Wedding-day coverage' },
    { slug: 'couple_engagement', label: 'Couple & engagement shoots' },
    { slug: 'portrait_studio', label: 'Portrait & studio sessions' },
    { slug: 'other_events', label: 'Other events & parties' },
  ],
  catering: [
    { slug: 'full_service', label: 'Full-service catering' },
    { slug: 'cakes', label: 'Cakes' },
    { slug: 'dessert_tables', label: 'Dessert tables & sweets' },
    { slug: 'grazing_charcuterie', label: 'Grazing & charcuterie' },
  ],
  // Hair and makeup are two chips, not three: a vendor who does both selects
  // both, and the AND-membership subcategory filter (.contains / @>) surfaces
  // them for "Hair", "Makeup", or "Hair + Makeup" queries alike.
  hair_makeup: [
    { slug: 'hair', label: 'Hair' },
    { slug: 'makeup', label: 'Makeup' },
  ],
};

/** Heading text shown in the marketplace filter sheet's subcategory section. */
export const SUBCATEGORY_SECTION_LABEL: Record<string, string> = {
  carts: 'Cart type',
  photography: 'Photography type',
  catering: 'Catering type',
  hair_makeup: 'Services offered',
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
