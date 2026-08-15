import { ShieldCheck } from 'lucide-react';
import { DEPOSIT_RATE } from '@/lib/utils';

interface HowBookingWorksProps {
  responseSlaHours?: number | null;
}

/**
 * Trust band — Baazar's actual differentiator against DMing a vendor on
 * Instagram: a protected, four-step path from inquiry to event day. Fills the
 * space a thin vendor profile would otherwise leave empty with real value.
 */
export function HowBookingWorks({ responseSlaHours }: HowBookingWorksProps) {
  const depositPct = Math.round(DEPOSIT_RATE * 100);
  const steps = [
    {
      n: '01',
      title: 'Send your request',
      body: 'Share your date, guest count, and what you have in mind. No account needed to ask.',
    },
    {
      n: '02',
      title: 'Get a quote back',
      body: responseSlaHours
        ? `This vendor usually replies within ~${responseSlaHours}h with pricing built for your event.`
        : 'The vendor replies with pricing built around your event, not a generic price list.',
    },
    {
      n: '03',
      title: 'Hold your date',
      body: `Pay a ${depositPct}% deposit through Baazar to lock the date. It is protected until your event is confirmed.`,
      accent: true,
    },
    {
      n: '04',
      title: 'Celebrate',
      body: 'The vendor delivers on the day. You settle the rest with them directly, no surprises.',
    },
  ];

  return (
    <section aria-labelledby="how-it-works-heading" className="border-t border-hairline pt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
        How booking works
      </p>
      <h2 id="how-it-works-heading" className="mt-2 font-display text-2xl font-bold text-ink">
        Booked in four steps
      </h2>

      <ol className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="relative">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-medium tabular-nums text-indigo">{s.n}</span>
              {s.accent && (
                <span className="h-1.5 w-1.5 rounded-full bg-haldi" aria-hidden="true" />
              )}
            </div>
            <h3 className="mt-2 font-display text-base font-semibold text-ink">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">{s.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 inline-flex items-center gap-2 rounded-md bg-cream-soft px-3.5 py-2.5 text-xs text-ink/80">
        <ShieldCheck className="h-4 w-4 shrink-0 text-indigo" aria-hidden="true" />
        Your deposit is held by Baazar and covered by our cancellation and dispute policy.
      </p>
    </section>
  );
}
