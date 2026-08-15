import { DEPOSIT_RATE } from '@/lib/utils';

export interface PackageLike {
  id: string;
  base_price_cents: number | null;
  is_featured?: boolean | null;
}

function cheapest<T extends PackageLike>(packages: T[]): T | null {
  if (packages.length === 0) return null;
  return packages.reduce((min, current) => {
    const minPrice = min.base_price_cents ?? Infinity;
    const currPrice = current.base_price_cents ?? Infinity;
    return currPrice < minPrice ? current : min;
  });
}

/**
 * The "Most popular" package. A vendor may explicitly flag one (is_featured);
 * we honor that, picking the cheapest among flagged rows if several are set
 * (the service enforces a single flag, but this stays robust if that drifts).
 * When no package is flagged, we fall back to the cheapest — the historical
 * behavior — so existing vendors see no change until they opt in.
 */
export function getFeaturedPackage<T extends PackageLike>(packages: T[]): T | null {
  if (packages.length === 0) return null;
  const flagged = packages.filter((p) => p.is_featured);
  return cheapest(flagged.length > 0 ? flagged : packages);
}

export function calculateDeposit(totalCents: number): number {
  return Math.round(totalCents * DEPOSIT_RATE);
}

export function calculateRemaining(totalCents: number): number {
  return totalCents - calculateDeposit(totalCents);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Smooth-scrolls to the packages comparison section and briefly pulses the
 * featured package card to draw the eye. No-op if the section isn't on the page.
 * Respects prefers-reduced-motion: scroll jumps instantly and the pulse keyframe
 * is overridden in CSS so the highlight remains static.
 */
export function scrollToPackages(): void {
  // VendorProfile renders a #packages-section in BOTH the mobile (`md:hidden`)
  // and desktop (`hidden md:block`) columns, so two elements share the id.
  // getElementById returns the FIRST in DOM order (the mobile one), which is
  // display:none on desktop → scrollIntoView no-ops. Pick the VISIBLE section.
  const sections = Array.from(document.querySelectorAll<HTMLElement>('#packages-section'));
  const section = sections.find((el) => el.offsetParent !== null) ?? sections[0] ?? null;
  if (!section) return;
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start',
  });
  const featuredCard = section.querySelector<HTMLElement>('[data-pkg-featured="true"]');
  if (featuredCard) {
    featuredCard.classList.add('pulse-pink');
    setTimeout(() => featuredCard.classList.remove('pulse-pink'), 1500);
  }
}
