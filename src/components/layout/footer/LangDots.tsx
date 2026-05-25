import { WORDMARK_SCRIPTS } from './wordmark-cycle-helpers';

/**
 * Four static script glyphs in the footer legal row. Passive cultural
 * signature — no interactivity, no hover, no locale switching. Devanagari
 * is rendered as "active" (ink + bold).
 */
export function LangDots() {
  return (
    <div className="flex items-center gap-[18px]" aria-label="Scripts">
      {WORDMARK_SCRIPTS.map((s) => {
        const isActive = s.key === 'deva';
        // Nastaliq has more vertical density — render slightly smaller for visual parity.
        const sizeClass =
          s.key === 'nastaliq' ? 'text-xs' : s.key === 'persian' ? 'text-base' : 'text-sm';
        return (
          <span
            key={s.key}
            title={s.a11yLabel}
            className={`leading-none ${sizeClass} ${
              isActive ? 'font-semibold text-ink' : 'text-ink-soft'
            }`}
            style={{ fontFamily: s.cssFamily }}
          >
            {s.glyph}
          </span>
        );
      })}
    </div>
  );
}
