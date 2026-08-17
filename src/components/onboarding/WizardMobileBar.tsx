'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Eye } from 'lucide-react';
import { STEPS } from './WizardStepper';
import { OnboardingPreview } from './OnboardingPreview';
import type { WizardStep } from '@/lib/onboarding/resume';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

/**
 * Mobile-only wizard header. The desktop rail (WizardStepper) is `hidden md:block`,
 * so on phones this is the only place progress, Back, Save & exit, and the live
 * preview live. Sticky so it stays reachable through the long Step 1 scroll.
 */
export function WizardMobileBar({ profile }: { profile: VendorRow }) {
  const pathname = usePathname();
  const current = (pathname.split('/').pop() as WizardStep) ?? 'basics';
  const currentIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.key === current)
  );
  const prev = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const pct = Math.round(((currentIdx + 1) / STEPS.length) * 100);
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-ink/10 bg-cream/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        {prev ? (
          <Link
            href={`/dashboard/profile/setup/${prev.key}`}
            className="-ml-2 inline-flex min-h-[40px] items-center gap-1 rounded px-2 py-2 text-sm text-ink/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
          >
            <ChevronLeft className="size-4" />
            Back
          </Link>
        ) : (
          <span className="text-sm font-medium text-ink">
            Step {currentIdx + 1} of {STEPS.length}
          </span>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            className="inline-flex min-h-[40px] items-center gap-1 rounded px-2 py-2 text-sm text-ink/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
          >
            <Eye className="size-4" />
            Preview
          </button>
          <Link
            href="/dashboard"
            className="-mr-2 inline-flex min-h-[40px] items-center rounded px-2 py-2 text-sm text-ink/70 underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
          >
            Save &amp; exit
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        {prev && (
          <p className="mb-1 text-xs text-ink/60">
            Step {currentIdx + 1} of {STEPS.length}
          </p>
        )}
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-indigo transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {showPreview && (
        <div className="mt-4">
          <OnboardingPreview profile={profile} />
        </div>
      )}
    </div>
  );
}
