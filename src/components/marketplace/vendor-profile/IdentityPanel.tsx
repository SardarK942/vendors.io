// src/components/marketplace/vendor-profile/IdentityPanel.tsx
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface IdentityPanelProps {
  vendor: VendorRow;
}

/**
 * A one-line bio (≤ this many chars, no line breaks) renders as a large
 * editorial pull-quote so a two-word bio reads as a deliberate statement rather
 * than a stub. Anything longer is treated as real prose. Italic display here is
 * the DESIGN.md "vendor quote callout" — the one place italic body is allowed.
 */
const SHORT_BIO_MAX = 90;

/**
 * "About" section. The vendor's name, category, location, languages, years, and
 * trust signals live in VendorHero, so this panel carries only the bio. Returns
 * null when there is no bio — a thin vendor's identity is fully expressed by the
 * hero band, so an empty "About" heading never renders.
 */
export function IdentityPanel({ vendor }: IdentityPanelProps) {
  const bio = vendor.bio?.trim();
  if (!bio) return null;

  const isShort = bio.length <= SHORT_BIO_MAX && !bio.includes('\n');

  return (
    <section data-testid="identity-panel">
      {isShort ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">About</p>
          <p className="mt-3 max-w-[22ch] text-pretty font-display text-3xl font-medium italic leading-[1.12] text-ink md:text-[2.5rem]">
            {bio}
          </p>
        </>
      ) : (
        <>
          <h2 className="font-display text-2xl font-bold text-ink">About</h2>
          <p className="mt-3 max-w-[65ch] whitespace-pre-wrap text-base leading-relaxed text-ink/85">
            {bio}
          </p>
        </>
      )}
    </section>
  );
}
