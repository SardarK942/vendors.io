'use client';

import * as React from 'react';
import { CoupleOnboarding } from './CoupleOnboarding';
import { VendorOnboarding } from './VendorOnboarding';

export interface OnboardingGateProps {
  role: 'couple' | 'vendor';
  /** Whether the user has already completed (or skipped) onboarding. If true, gate is a no-op. */
  onboardingCompleted: boolean;
}

/**
 * Auto-fires the appropriate onboarding modal on first dashboard visit.
 * Receives role + completion state from the dashboard layout's server-side fetch
 * so the modal renders without a client-side flash.
 *
 * Once dismissed (via Skip, Esc, complete, or backdrop click), the API marks
 * users.onboarding_completed_at, so subsequent dashboard renders pass
 * onboardingCompleted=true and this component is a no-op.
 */
export function OnboardingGate({ role, onboardingCompleted }: OnboardingGateProps) {
  const [open, setOpen] = React.useState(!onboardingCompleted);

  if (onboardingCompleted) return null;

  if (role === 'couple') {
    return <CoupleOnboarding open={open} onOpenChange={setOpen} />;
  }
  if (role === 'vendor') {
    return <VendorOnboarding open={open} onOpenChange={setOpen} />;
  }

  return null;
}
