'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import {
  nextIncompleteStep,
  stepStatuses,
  type WizardStep,
  type ProfileRowShape,
} from '@/lib/onboarding/resume';

export const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'location', label: 'Location' },
  { key: 'online', label: 'Online presence' },
  { key: 'details', label: 'Profile details' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'review', label: 'Review & publish' },
];

interface Props {
  profile: ProfileRowShape | null;
}

export function WizardStepper({ profile }: Props) {
  const pathname = usePathname();
  const current = (pathname.split('/').pop() as WizardStep) ?? 'basics';
  const next = nextIncompleteStep(profile);
  const nextIdx = STEPS.findIndex((s) => s.key === next);
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  const statuses = stepStatuses(profile);
  const statusByKey = new Map(statuses.map((s) => [s.key, s]));
  const stepNumber = currentIdx + 1;
  const pct = Math.round((stepNumber / STEPS.length) * 100);

  return (
    <nav className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
          Set up your profile
        </h2>

        {/* Step progress bar */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-medium text-ink">
              Step {stepNumber} of {STEPS.length}
            </span>
            <span className="tabular-nums text-ink-soft">{pct}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
            role="progressbar"
            aria-valuenow={stepNumber}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label="Onboarding progress"
          >
            <div
              className="h-full rounded-full bg-indigo transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {STEPS[currentIdx]?.label
          ? `Step ${currentIdx + 1} of ${STEPS.length}: ${STEPS[currentIdx].label}`
          : ''}
      </p>

      <ol className="relative">
        {STEPS.map((step, idx) => {
          const status = statusByKey.get(step.key);
          const isComplete = !!status?.complete;
          const isOptional = !!status?.optional;
          const isCurrent = step.key === current;
          const isReachable = isComplete || isCurrent || idx <= nextIdx;
          const isLast = idx === STEPS.length - 1;

          const row = (
            <span
              className={`relative flex items-center gap-3 rounded-md py-2 pl-1.5 pr-3 text-sm transition-colors ${
                isCurrent
                  ? 'bg-ink/[0.055] font-semibold text-ink'
                  : isComplete
                    ? 'text-ink hover:bg-ink/[0.03]'
                    : 'text-ink-soft hover:bg-ink/[0.03]'
              }`}
            >
              {/* Connector spine to the next step — fills once this step is done */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[1.25rem] top-[1.95rem] h-[calc(100%-0.6rem)] w-px transition-colors duration-300 ${
                    isComplete ? 'bg-indigo/50' : 'bg-ink/[0.12]'
                  }`}
                />
              )}
              <span
                className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors duration-200 ${
                  isComplete
                    ? 'border-indigo bg-indigo text-cream'
                    : isCurrent
                      ? 'border-ink bg-cream text-ink'
                      : 'border-ink/25 bg-cream text-ink-soft'
                }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : idx + 1}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{step.label}</span>
                {isOptional && !isComplete && (
                  <span className="text-[11px] font-normal text-ink-soft">Optional</span>
                )}
              </span>
            </span>
          );

          return (
            <li key={step.key}>
              {isReachable ? (
                <Link
                  href={`/dashboard/profile/setup/${step.key}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ol>

      <Link
        href="/dashboard"
        className="block rounded px-3 py-2 text-xs text-ink-soft underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        Save &amp; exit
      </Link>
    </nav>
  );
}
