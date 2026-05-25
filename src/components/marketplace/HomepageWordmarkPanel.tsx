/**
 * Right-side brand panel of the V2 asymmetric homepage hero.
 * Tagline + static Devanagari wordmark + 4-script glyph row.
 * No animation — the footer carries the page's one cycling wordmark moment.
 */
export function HomepageWordmarkPanel() {
  return (
    <div className="relative hidden border-l border-hairline pl-16 lg:block">
      <p className="m-0 mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        MADE IN <span className="text-haldi">CHICAGO</span>
      </p>

      <h2
        aria-label="Baazar"
        className="m-0 leading-[0.85] tracking-[-0.03em] text-ink"
        style={{
          fontFamily: 'var(--font-wordmark-deva), serif',
          fontSize: 'clamp(72px, 9vw, 130px)',
          fontWeight: 400,
        }}
      >
        <span aria-hidden="true">बाज़ार</span>
        <span aria-hidden="true" className="text-hot-pink">
          .
        </span>
      </h2>

      <div className="mt-5 flex items-baseline gap-4" aria-label="Scripts">
        <span
          title="Hindi"
          className="text-base font-semibold leading-none text-ink"
          style={{ fontFamily: 'var(--font-wordmark-deva), serif' }}
        >
          बाज़ार
        </span>
        <span
          title="Urdu"
          className="text-xs leading-none text-ink-soft"
          style={{ fontFamily: 'var(--font-wordmark-nastaliq), serif' }}
        >
          بازار
        </span>
        <span
          title="Arabic"
          className="text-sm leading-none text-ink-soft"
          style={{ fontFamily: 'var(--font-wordmark-naskh), serif' }}
        >
          بازار
        </span>
        <span
          title="Persian"
          className="text-base leading-none text-ink-soft"
          style={{ fontFamily: 'var(--font-wordmark-persian), serif' }}
        >
          بازار
        </span>
      </div>
    </div>
  );
}
