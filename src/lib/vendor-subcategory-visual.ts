// Per-subcategory glyphs — the sibling of vendor-category-visual.ts one level
// down. Same discipline: a subcategory's identity is signaled by a distinct
// SHAPE, never by color, so the M+ palette stays quiet. Consumed by the inline
// SubcategoryStrip on /vendors (and reusable anywhere subcategories render).
//
// Keyed by the subcategory slug from SUBCATEGORIES_BY_CATEGORY. Slugs are unique
// across the current taxonomy; if a future slug collides across two categories
// with different meanings, switch this to a `${category}:${slug}` key.
import {
  IceCreamCone,
  CupSoda,
  Utensils,
  UtensilsCrossed,
  Gift,
  Heart,
  Gem,
  Aperture,
  PartyPopper,
  Cake,
  CakeSlice,
  Grape,
  Scissors,
  Brush,
  Flower2,
  PenTool,
  Package,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react';

const SUBCATEGORY_ICON: Record<string, LucideIcon> = {
  // carts
  dessert: IceCreamCone,
  beverage: CupSoda,
  appetizer: Utensils,
  favor_gift: Gift,
  // photography
  wedding_day: Heart,
  couple_engagement: Gem,
  portrait_studio: Aperture,
  other_events: PartyPopper,
  // catering
  full_service: UtensilsCrossed,
  cakes: Cake,
  dessert_tables: CakeSlice,
  grazing_charcuterie: Grape,
  // hair_makeup
  hair: Scissors,
  makeup: Brush,
  // decor
  florals: Flower2,
  signage: PenTool,
  rentals: Package,
  full_decor: Sparkles,
};

/** Glyph for a subcategory slug. Falls back to a tag for unknown/empty keys. */
export function getSubcategoryIcon(slug: string | null | undefined): LucideIcon {
  return (slug && SUBCATEGORY_ICON[slug]) || Tag;
}
