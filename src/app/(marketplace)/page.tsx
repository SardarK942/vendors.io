import { CheckCircle, Shield, Clock } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HomepageHero } from '@/components/marketplace/HomepageHero';
import { CategoryHoverExpand } from '@/components/marketplace/CategoryHoverExpand';
import { CategoryHoverExpandMobile } from '@/components/marketplace/CategoryHoverExpandMobile';
import { HowItWorks } from '@/components/marketplace/HowItWorks';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import { getCategoryVendorCounts } from '@/lib/vendor-categories/queries';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();

  // Determine whether to show the "List your business" CTA (hide for couples).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    role = profile?.role ?? null;
  }
  const showVendorCta = role !== 'couple';

  // Per-category vendor counts for the HoverExpand tiles.
  const counts = await getCategoryVendorCounts(supabase);

  return (
    <div>
      {/* Hero — V2 asymmetric */}
      <HomepageHero showVendorCta={showVendorCta} />

      {/* Section header */}
      <header className="mx-auto max-w-[1280px] px-6 pb-2 pt-12 text-center lg:px-14">
        <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Browse by category
        </p>
        <h2
          className="m-0 mb-2 font-serif font-bold leading-[0.96] tracking-[-0.020em] text-ink"
          style={{ fontSize: 'clamp(28px, 3.5vw, 44px)' }}
        >
          Every vendor your celebration needs.
        </h2>
        <p className="m-0 mx-auto max-w-[540px] text-base text-ink-muted">
          Photography, mehndi, catering, and eight more. Hover to peek; click to browse.
        </p>
      </header>

      {/* HoverExpand — desktop */}
      <CategoryHoverExpand categories={CATEGORIES_FEATURED} counts={counts} />

      {/* Mobile fallback */}
      <CategoryHoverExpandMobile categories={CATEGORIES_FEATURED} counts={counts} />

      {/* Skiper UI attribution */}
      <p className="mx-auto max-w-[1280px] px-6 pb-8 text-center text-[10px] text-ink-soft lg:px-14">
        Category browser pattern adapted from{' '}
        <a href="https://skiper-ui.com" target="_blank" rel="noopener" className="hover:text-ink">
          Skiper UI
        </a>{' '}
        · Original by{' '}
        <a href="https://x.com/Gur__vi" target="_blank" rel="noopener" className="hover:text-ink">
          @Gur__vi
        </a>
      </p>

      {/* H3 — Book your perfect vendor in three simple steps. */}
      <HowItWorks />

      {/* H6 — Why Customers Trust Us. Re-skinned to the M+ brand per the Figma
          redesign (frame 113:86): full-bleed cream band with a rounded top,
          serif ink heading, white circular icon badges with indigo chrome. */}
      <section className="mt-14 rounded-t-[2.5rem] bg-cream-soft px-6 py-16 lg:px-14">
        <div className="mx-auto max-w-[1120px]">
          <h2
            className="mb-12 text-center font-serif font-bold tracking-[-0.02em] text-ink"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)' }}
          >
            Why Customers Trust Us
          </h2>
          <div className="grid gap-10 sm:grid-cols-3">
            {[
              {
                Icon: CheckCircle,
                title: 'Verified Vendors',
                body: 'Every vendor is verified. Real businesses, real portfolios, real pricing.',
              },
              {
                Icon: Shield,
                title: 'Secure Deposits',
                body: "Small hold deposits powered by Stripe. Full refund if the vendor doesn't confirm.",
              },
              {
                Icon: Clock,
                title: 'Fast Response',
                body: 'Vendors must respond within 72 hours. No more waiting weeks for quotes.',
              },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-cream shadow-sm ring-1 ring-ink/5">
                  <Icon className="size-7 text-indigo" strokeWidth={1.75} />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
                <p className="mx-auto mt-2 max-w-[34ch] text-base leading-[1.5] text-ink-muted">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
