import Link from 'next/link';
import { Quote } from 'lucide-react';

/**
 * "Why Couples Choose Baazar" + testimonials row — H4 of the homepage redesign.
 * Card style follows the Figma testimonial card (frame 113:86): avatar pill on
 * top, oversized quote glyph, quote body, and the attribution set off by a left
 * accent rule with a mono name.
 *
 * NOTE: these testimonials are CURATED PLACEHOLDERS (illustrative, generic —
 * first name + city, no faces, no star ratings) to be swapped for real couple
 * reviews once a testimonials data source exists. Do not present as verified
 * reviews. Tracked in docs/superpowers/specs/2026-08-04-homepage-signup-redesign-design.md (H4).
 */
const TESTIMONIALS = [
  {
    quote:
      'We found our photographer and caterer in a single weekend. Every vendor was verified and actually replied.',
    name: 'Priya & Arjun',
    city: 'Naperville, IL',
    event: 'Wedding',
  },
  {
    quote:
      'The small deposit made it feel safe — we locked in our mehndi artist months ahead without any stress.',
    name: 'Sana R.',
    city: 'Chicago, IL',
    event: 'Mehndi',
  },
  {
    quote:
      'One place for the whole celebration — DJ, décor, catering. It saved us weeks of back-and-forth.',
    name: 'Meera & Dev',
    city: 'Schaumburg, IL',
    event: 'Reception',
  },
] as const;

function initials(name: string): string {
  return name
    .replace(/[^A-Za-z& ]/g, '')
    .split(/\s+/)
    .filter((w) => w && w !== '&')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function WhyCouplesChoose() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pb-16 pt-4 lg:px-14 lg:pb-20">
      <header className="mx-auto mb-12 max-w-[640px] text-center">
        <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Loved by couples
        </p>
        <h2
          className="m-0 mb-3 text-balance font-serif font-bold tracking-[-0.02em] text-ink"
          style={{ fontSize: 'clamp(28px, 3.5vw, 44px)' }}
        >
          Why couples choose Baazar
        </h2>
        <p className="m-0 text-base leading-[1.55] text-ink-muted">
          Couples planning cultural weddings across Chicago trust Baazar to make the day
          unforgettable.
        </p>
      </header>

      <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-3">
        {TESTIMONIALS.map(({ quote, name, city, event }) => (
          <li
            key={name}
            className="group flex flex-col rounded-3xl bg-[#f2efe6] p-8 ring-1 ring-ink/5 transition duration-300 hover:-translate-y-1 hover:shadow-pink-card hover:ring-hot-pink/25 motion-reduce:hover:translate-y-0"
          >
            {/* Avatar pill */}
            <div className="inline-flex items-center gap-2.5 self-start rounded-full bg-white/70 py-1.5 pl-1.5 pr-4 ring-1 ring-ink/5">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo/10 text-xs font-semibold text-indigo transition-colors duration-300 group-hover:bg-hot-pink group-hover:text-cream"
              >
                {initials(name)}
              </span>
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                {event}
              </span>
            </div>

            {/* Oversized quote glyph */}
            <Quote
              aria-hidden
              className="mt-7 size-8 rotate-180 text-ink/15 transition-colors duration-300 group-hover:text-hot-pink/30"
              strokeWidth={1.5}
            />

            {/* Quote body */}
            <p className="m-0 mt-3 flex-1 text-[19px] leading-[1.45] tracking-[-0.01em] text-ink">
              {quote}
            </p>

            {/* Attribution with accent rule */}
            <div className="mt-8 border-l-2 border-ink/15 pl-4 transition-colors duration-300 group-hover:border-hot-pink">
              <p className="m-0 font-mono text-sm font-semibold uppercase tracking-[0.1em] text-ink">
                {name}
              </p>
              <p className="m-0 mt-1 text-sm text-ink-soft">{city}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 text-center">
        <Link
          href="/vendors"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink px-6 text-sm font-semibold text-cream transition hover:-translate-y-px hover:bg-hot-pink hover:shadow-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream motion-reduce:hover:translate-y-0"
        >
          Browse all vendors →
        </Link>
      </div>
    </section>
  );
}
