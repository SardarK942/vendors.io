import { Search, MessageSquareQuote, CalendarCheck } from 'lucide-react';

/**
 * "Book your perfect vendor in three simple steps" — H3 of the homepage
 * redesign. Copy mirrors the REAL couple journey in the product (verified
 * against the code, not the Figma placeholder): browse/search → request a quote
 * from a chosen vendor → pay a 5% deposit once the vendor accepts. There is no
 * "broadcast your event to vendors" matching flow, so step 1 is discovery, not
 * an event intake. 5% deposit to Baazar, remaining ~95% settled off-platform
 * (DEPOSIT_RATE in lib/utils.ts; DepositDialog copy).
 *
 * Rendered as an ordered list for correct step semantics. Cards lift + turn the
 * icon badge hot-pink on hover.
 */
const STEPS = [
  {
    n: '01',
    Icon: Search,
    title: 'Discover vendors',
    body: 'Browse by category or search verified cultural vendors across Chicago, and open the ones you love.',
  },
  {
    n: '02',
    Icon: MessageSquareQuote,
    title: 'Request a quote',
    body: 'Pick a package or send a custom request. Your vendor confirms availability and sends a tailored quote — usually within 72 hours.',
  },
  {
    n: '03',
    Icon: CalendarCheck,
    title: 'Book with a 5% deposit',
    body: 'When your vendor accepts, pay a 5% deposit to lock in your date. The remaining balance is paid directly to the vendor.',
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
            className="group rounded-2xl bg-white p-8 shadow-[0px_2px_36px_rgba(0,0,0,0.07)] ring-1 ring-ink/5 transition duration-300 hover:-translate-y-1 hover:shadow-pink-card hover:ring-hot-pink/20 motion-reduce:hover:translate-y-0"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-ink-soft transition-colors group-hover:text-hot-pink">
                Step {n}
              </span>
              <span className="flex size-12 items-center justify-center rounded-full bg-ink/[0.04] transition-colors duration-300 group-hover:bg-hot-pink/15">
                <Icon
                  className="size-6 text-ink transition-colors duration-300 group-hover:text-hot-pink"
                  strokeWidth={1.75}
                />
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
