import { DEPOSIT_RATE } from '@/lib/utils';

export interface PackageLike {
  id: string;
  base_price_cents: number | null;
}

export function getFeaturedPackage<T extends PackageLike>(packages: T[]): T | null {
  if (packages.length === 0) return null;
  return packages.reduce((cheapest, current) => {
    const cheapPrice = cheapest.base_price_cents ?? Infinity;
    const currPrice = current.base_price_cents ?? Infinity;
    return currPrice < cheapPrice ? current : cheapest;
  });
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
 * Respects prefers-reduced-motion via CSS (the pulse keyframe is overridden).
 */
export function scrollToPackages(): void {
  const section = document.getElementById('packages-section');
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const featuredCard = section.querySelector<HTMLElement>('[data-pkg-featured="true"]');
  if (featuredCard) {
    featuredCard.classList.add('pulse-pink');
    setTimeout(() => featuredCard.classList.remove('pulse-pink'), 1500);
  }
}
