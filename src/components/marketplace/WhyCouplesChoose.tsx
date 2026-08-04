import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * "Why Couples Choose Baazar" + testimonials row — H4 of the homepage Figma
 * redesign (frame 113:86).
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
    context: 'Naperville · Wedding',
  },
  {
    quote:
      'The small deposit made it feel safe — we locked in our mehndi artist months ahead without any stress.',
    name: 'Sana R.',
    context: 'Chicago · Mehndi',
  },
  {
    quote:
      'One place for the whole celebration — DJ, décor, catering. It saved us weeks of back-and-forth messages.',
    name: 'Meera & Dev',
    context: 'Schaumburg · Reception',
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
        {TESTIMONIALS.map(({ quote, name, context }) => (
          <li
            key={name}
            className="flex flex-col rounded-2xl bg-white p-7 shadow-[0px_2px_36px_rgba(0,0,0,0.07)] ring-1 ring-ink/5"
          >
            <p className="m-0 flex-1 text-lg leading-[1.5] tracking-[-0.01em] text-ink">
              &ldquo;{quote}&rdquo;
            </p>
            <div className="mt-6 flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo/10 text-sm font-semibold text-indigo"
              >
                {initials(name)}
              </span>
              <span className="flex flex-col">
                <span className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-ink">
                  {name}
                </span>
                <span className="text-xs text-ink-soft">{context}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 text-center">
        <Button size="lg" variant="outline" asChild>
          <Link href="/vendors">Browse all vendors</Link>
        </Button>
      </div>
    </section>
  );
}
