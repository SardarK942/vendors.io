import Link from 'next/link';
import { AiSearchInput } from '@/components/marketplace/AiSearchInput';
import { RotatingWord } from '@/components/marketplace/RotatingWord';
import { HeroVideoBackdrop } from '@/components/marketplace/HeroVideoBackdrop';

export interface HomepageHeroProps {
  /** When true, render the "List your business" secondary CTA. */
  showVendorCta: boolean;
}

/**
 * Full-bleed video-backdrop homepage hero (Figma frame 113:86 direction):
 * an autoplaying muted video fills the section behind a dark scrim, with the
 * type stack (kicker + rotating headline + subhead + AI search + dual CTAs)
 * overlaid in light type. The video degrades to a static poster under
 * prefers-reduced-motion (see HeroVideoBackdrop).
 */
export function HomepageHero({ showVendorCta }: HomepageHeroProps) {
  return (
    <section className="relative isolate flex min-h-[88svh] items-center overflow-hidden">
      <HeroVideoBackdrop />

      <div className="mx-auto w-full max-w-[1280px] px-6 py-20 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] lg:px-14 lg:py-28">
        <div className="max-w-[760px] text-left">
          <p className="m-0 mb-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/75">
            Baazar · Chicago weddings
          </p>

          <h1
            className="m-0 mb-7 text-balance font-serif font-extrabold leading-[0.98] tracking-[-0.025em] text-cream [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]"
            style={{ fontSize: 'clamp(44px, 6vw, 80px)' }}
          >
            Planning your{' '}
            <em className="font-medium italic text-hot-pink">
              <RotatingWord words={['dream wedding', 'mehndi night', 'walima', 'celebration']} />
            </em>
            <br />
            starts here.
          </h1>

          <p className="m-0 mb-8 max-w-[560px] text-pretty text-lg leading-[1.55] text-cream/85">
            Chicago&rsquo;s marketplace for{' '}
            <span className="bg-haldi box-decoration-clone px-2 pb-1 pt-0 text-ink">Cultural</span>{' '}
            wedding vendors. Discover, compare, and book with confidence.
          </p>

          <div className="mb-5 max-w-[560px]">
            <AiSearchInput variant="hero" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/vendors"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-hot-pink px-6 text-sm font-semibold text-cream shadow-pink transition hover:-translate-y-px hover:bg-hot-pink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink motion-reduce:hover:translate-y-0"
            >
              Browse all vendors →
            </Link>
            {showVendorCta && (
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-cream/40 bg-cream/10 px-6 text-sm font-semibold text-cream backdrop-blur-sm transition hover:bg-cream/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                List your business
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
