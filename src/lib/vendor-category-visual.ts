// Per-category visual identity for the marketplace grid. Category "type" is
// signaled by a distinct glyph (shape), not by color — the M+ palette stays
// disciplined (no 15-color rainbow). Reused on cards + photo-less fallbacks.
import {
  Camera,
  Video,
  Clapperboard,
  Hand,
  Scissors,
  Disc3,
  Aperture,
  UtensilsCrossed,
  Building2,
  Flower2,
  Mail,
  Shirt,
  Mic2,
  IceCreamCone,
  Gift,
  Store,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICON: Record<string, LucideIcon> = {
  photography: Camera,
  videography: Video,
  content_creation: Clapperboard,
  mehndi: Hand,
  hair_makeup: Scissors,
  dj: Disc3,
  photobooth: Aperture,
  catering: UtensilsCrossed,
  venue: Building2,
  decor: Flower2,
  invitations: Mail,
  bridal_wear: Shirt,
  live_music: Mic2,
  carts: IceCreamCone,
  gifts: Gift,
};

/** Glyph for a vendor category. Falls back to a storefront for unknown keys. */
export function getCategoryIcon(category: string | null | undefined): LucideIcon {
  return (category && CATEGORY_ICON[category]) || Store;
}

// Short labels for the category icon bar (the full VENDOR_CATEGORY_LABELS run
// too long under an icon, e.g. "Videography & Content").
const CATEGORY_SHORT_LABEL: Record<string, string> = {
  photography: 'Photography',
  videography: 'Video',
  content_creation: 'Reels',
  mehndi: 'Mehndi',
  hair_makeup: 'Hair & Makeup',
  dj: 'DJ',
  photobooth: 'Photo Booth',
  catering: 'Catering',
  venue: 'Venue',
  decor: 'Decor',
  invitations: 'Invites',
  bridal_wear: 'Bridal',
  live_music: 'Live Music',
  carts: 'Carts',
  gifts: 'Gifts',
};

/** Compact category label for the icon bar. */
export function getCategoryShortLabel(category: string): string {
  return CATEGORY_SHORT_LABEL[category] ?? category;
}
