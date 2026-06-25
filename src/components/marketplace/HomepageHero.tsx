import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/marketplace/SearchBar';
import { HomepageWordmarkPanel } from '@/components/marketplace/HomepageWordmarkPanel';

export interface HomepageHeroProps {
  /** When true, render the "List your business" secondary CTA. */
  showVendorCta: boolean;
}

/**
 * V2 asymmetric homepage hero: left = type stack (kicker + headline + subhead +
 * SearchBar + dual CTAs), right = brand panel (static Devanagari wordmark + 4-
 * script glyph row). Stacks to single-column under lg: breakpoint (the right
 * panel hides on mobile per HomepageWordmarkPanel's `hidden lg:block` class).
 *
 * Locked copy per docs/superpowers/specs/2026-05-25-baazar-homepage-hero-design.md.
 */
export function HomepageHero({ showVendorCta }: HomepageHeroProps) {
  return (
    <section className="pb-22 lg:gap-18 grid grid-cols-1 gap-10 px-6 pt-16 lg:grid-cols-[1.5fr_1fr] lg:px-14 lg:pb-24 lg:pt-24">
      <div className="text-left">
        <p className="m-0 mb-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Baazar · Chicago weddings
        </p>

        <h1
          className="m-0 mb-7 font-serif font-extrabold leading-[0.92] tracking-[-0.025em] text-ink"
          style={{ fontSize: 'clamp(44px, 6vw, 76px)' }}
        >
          All your vendors.
          <br />
          <em className="font-medium italic text-hot-pink">One bazaar.</em>
        </h1>

        <p className="m-0 mb-8 max-w-[520px] text-lg leading-[1.55] text-ink-muted">
          Chicago&rsquo;s marketplace for{' '}
          <span className="bg-haldi box-decoration-clone px-2 pb-1 pt-0 text-ink">Cultural</span>{' '}
          wedding vendors. Discover, compare, and book with confidence.
        </p>

        <div className="mb-4">
          <SearchBar />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            asChild
            className="bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
          >
            <Link href="/vendors">Browse all vendors →</Link>
          </Button>
          {showVendorCta && (
            <Button size="lg" variant="outline" asChild>
              <Link href="/signup">List your business</Link>
            </Button>
          )}
        </div>
      </div>

      <HomepageWordmarkPanel />
    </section>
  );
}
