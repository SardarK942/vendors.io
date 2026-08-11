'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { STEPS } from './WizardStepper';
import type { WizardStep } from '@/lib/onboarding/resume';

/**
 * Desktop-only "Back" link to the previous step. The mobile bar carries its own
 * Back control, and the rail's clickable steps handle jump-back — this fills the
 * gap for a linear Back affordance on desktop. Hidden on the first step.
 */
export function WizardBackLink() {
  const pathname = usePathname();
  const current = (pathname.split('/').pop() as WizardStep) ?? 'basics';
  const idx = STEPS.findIndex((s) => s.key === current);
  if (idx <= 0) return null;
  const prev = STEPS[idx - 1]!;

  return (
    <Link
      href={`/dashboard/profile/setup/${prev.key}`}
      className="mb-4 hidden items-center gap-1 text-sm text-ink/60 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo md:inline-flex"
    >
      <ChevronLeft className="size-4" />
      Back
    </Link>
  );
}
