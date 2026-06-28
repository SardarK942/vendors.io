import { CheckCircle, Shield, Clock } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HomepageHero } from '@/components/marketplace/HomepageHero';
import { CategoryHoverExpand } from '@/components/marketplace/CategoryHoverExpand';
import { CategoryHoverExpandMobile } from '@/components/marketplace/CategoryHoverExpandMobile';
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

      {/* Trust Signals — pre-M+, deferred refresh per spec */}
      <section className="mx-auto max-w-[1280px] rounded-xl bg-muted/50 px-6 py-12 lg:px-14">
        <h2 className="mb-8 text-center text-2xl font-bold">Why Customers Trust Us</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Verified Vendors</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Every vendor is verified. Real businesses, real portfolios, real pricing.
            </p>
          </div>
          <div className="text-center">
            <Shield className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Secure Deposits</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Small hold deposits powered by Stripe. Full refund if vendor doesn&apos;t confirm.
            </p>
          </div>
          <div className="text-center">
            <Clock className="mx-auto h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold">Fast Response</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Vendors must respond within 72 hours. No more waiting weeks for quotes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
