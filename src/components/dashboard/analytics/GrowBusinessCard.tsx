import * as React from 'react';
import { BarChart3, Wallet, Sparkles, ArrowRight, TrendingUp, type LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: BarChart3,
    title: 'View detailed reports',
    description: 'Understand performance insights',
  },
  { icon: Wallet, title: 'Track your earnings', description: 'See your payouts and fees' },
  { icon: Sparkles, title: 'Optimize your listings', description: "Understand what's working" },
];

// Indigo promo card. Server component — the "View Full Report" button is inert.
export function GrowBusinessCard() {
  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-indigo p-6 text-cream">
      <div>
        <TrendingUp className="size-6 text-cream" aria-hidden="true" />
        <h3 className="mt-3 font-display text-2xl leading-tight">Grow Your Business</h3>
        <p className="mt-2 text-sm text-cream/80">
          More bookings, better insights, more opportunities.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-cream" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-cream">{title}</p>
              <p className="text-xs text-cream/70">{description}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* STUB: inert — no full-report route exists yet. */}
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-haldi px-5 py-2.5 text-sm font-semibold text-ink"
        /* TODO(backend): link to full report export */
      >
        View Full Report
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
