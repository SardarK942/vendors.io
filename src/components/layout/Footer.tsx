import { WordmarkCycle } from './footer/WordmarkCycle';
import { NewsletterForm } from './footer/NewsletterForm';
import { LangDots } from './footer/LangDots';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-cream text-ink">
      {/* === Black hero band === */}
      <div className="bg-ink text-cream">
        <div className="relative mx-auto max-w-7xl px-6 pb-8 pt-12 md:px-14 md:pb-12 md:pt-24">
          <p className="static mb-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-soft md:absolute md:right-14 md:top-12 md:mb-0">
            Made in <span className="text-haldi">Chicago</span>
          </p>

          <WordmarkCycle />

          <div className="mt-8 flex flex-col items-stretch gap-4 border-t border-cream/[0.12] pt-6 md:flex-row md:items-center md:gap-6">
            <div className="flex items-baseline gap-3 whitespace-nowrap">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                The Bazaar Letter
              </span>
              <em className="font-serif text-[15px] font-medium italic text-cream">
                monthly, no noise
              </em>
            </div>
            <NewsletterForm />
          </div>
        </div>
      </div>

      {/* === Cream body band === */}
      <div className="bg-cream">
        <div className="mx-auto max-w-7xl px-6 pb-6 pt-12 md:px-14 md:pb-8 md:pt-16">
          <div className="grid grid-cols-1 gap-8 pb-10 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-14">
            <div>
              <h4 className="m-0 mb-3 font-serif text-2xl font-extrabold tracking-[-0.01em] text-ink">
                baazar<span className="text-hot-pink">.</span>
              </h4>
              <p className="m-0 max-w-[320px] text-sm leading-[1.55] text-ink-muted">
                Chicago&rsquo;s marketplace for South Asian wedding vendors. Discover, compare, and
                book with confidence.
              </p>
            </div>
            <div>
              <h5 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                For vendors
              </h5>
              <a
                href="/signup"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                List your business
              </a>
              <a
                href="/dashboard"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Vendor dashboard
              </a>
            </div>
            <div>
              <h5 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                Company
              </h5>
              <a
                href="/terms"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Terms
              </a>
              <a
                href="/privacy"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Privacy
              </a>
              <a
                href="mailto:hello@baazar.io"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Contact
              </a>
            </div>
          </div>

          {/* Legal band */}
          <div className="flex flex-col items-start justify-between gap-4 border-t border-hairline pt-6 md:flex-row md:items-center">
            <div className="flex flex-wrap items-center gap-[18px] text-xs text-ink-soft">
              <span>&copy; {year} Baazar Marketplace</span>
              <a
                href="/terms"
                className="text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                Terms
              </a>
              <a
                href="/privacy"
                className="text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                Privacy
              </a>
              <a
                href="mailto:hello@baazar.io"
                className="text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                Contact
              </a>
            </div>
            <LangDots />
          </div>
        </div>
      </div>
    </footer>
  );
}
