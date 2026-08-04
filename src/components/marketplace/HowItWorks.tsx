import { ClipboardList, MessagesSquare, CalendarCheck } from 'lucide-react';

/**
 * "Book your perfect vendor in three simple steps" — H3 of the homepage Figma
 * redesign (frame 113:86). Static, presentational; copy mirrors the Figma step
 * cards. The 5% deposit line matches the current payment model (5% to Baazar,
 * remaining 95% settled off-platform with the vendor).
 *
 * Rendered as an ordered list for correct step semantics. Brand-tokened (white
 * cards + soft shadow on the cream page) to sit consistently with the trust trio.
 */
const STEPS = [
  {
    n: '01',
    Icon: ClipboardList,
    title: 'Share Your Event',
    body: "Tell us about your event — your date, location, budget, and the services you need. We'll instantly notify the right vendors.",
  },
  {
    n: '02',
    Icon: MessagesSquare,
    title: 'Receive Quotes',
    body: 'Verified vendors review your request, confirm their availability, and send personalized quotes tailored to your celebration.',
  },
  {
    n: '03',
    Icon: CalendarCheck,
    title: 'Secure Your Date',
    body: 'Choose your favorite vendor and pay a 5% deposit to lock in your date. The remaining balance is paid directly to the vendor later.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pb-16 pt-14 lg:px-14 lg:pb-20">
      <header className="mx-auto mb-12 max-w-[640px] text-center">
        <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          How it works
        </p>
        <h2
          className="m-0 text-balance font-serif font-bold tracking-[-0.02em] text-ink"
          style={{ fontSize: 'clamp(28px, 3.5vw, 44px)' }}
        >
          Book your perfect vendor in three simple steps.
        </h2>
      </header>

      <ol className="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-3">
        {STEPS.map(({ n, Icon, title, body }) => (
          <li
            key={n}
            className="rounded-2xl bg-white p-8 shadow-[0px_2px_36px_rgba(0,0,0,0.07)] ring-1 ring-ink/5"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-ink-soft">
                Step {n}
              </span>
              <span className="flex size-12 items-center justify-center rounded-full bg-ink/[0.04]">
                <Icon className="size-6 text-indigo" strokeWidth={1.75} />
              </span>
            </div>
            <h3 className="mb-2 text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            <p className="m-0 text-base leading-[1.55] text-ink-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
