'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import { nextIncompleteStep, type WizardStep, type ProfileRowShape } from '@/lib/onboarding/resume';

const STEPS: { key: WizardStep; label: string }[] = [
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

  return (
    <nav className="space-y-1">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Set up your profile
      </h2>
      <ul className="space-y-1">
        {STEPS.map((step, idx) => {
          const isComplete = idx < nextIdx;
          const isCurrent = step.key === current;
          const isReachable = idx <= nextIdx;
          const content = (
            <span
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                isCurrent
                  ? 'bg-primary/10 font-semibold text-primary'
                  : isComplete
                    ? 'text-foreground hover:bg-accent'
                    : 'text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                  isComplete
                    ? 'border-green-500 bg-green-500 text-white'
                    : isCurrent
                      ? 'border-primary text-primary'
                      : 'border-muted-foreground/40'
                }`}
              >
                {isComplete ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              {step.label}
            </span>
          );
          return (
            <li key={step.key}>
              {isReachable ? (
                <Link href={`/dashboard/profile/setup/${step.key}`}>{content}</Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
      <Link
        href="/dashboard"
        className="mt-6 block px-3 py-2 text-xs text-muted-foreground underline hover:text-foreground"
      >
        Save &amp; exit
      </Link>
    </nav>
  );
}
