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
 * Renders the appropriate onboarding modal on signup-success.
 * Fires POST /api/users/onboarding-complete immediately on open (mark-on-show),
 * so even if the user closes the browser the modal won't reappear.
 */
export function OnboardingGate({ role, onboardingCompleted }: OnboardingGateProps) {
  const [open, setOpen] = React.useState(!onboardingCompleted);
  const markedRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !markedRef.current) {
      markedRef.current = true;
      fetch('/api/users/onboarding-complete', { method: 'POST' }).catch((err) => {
        console.error('Failed to mark onboarding complete:', err);
      });
    }
  }, [open]);

  if (onboardingCompleted) return null;

  if (role === 'couple') {
    return <CoupleOnboarding open={open} onOpenChange={setOpen} />;
  }
  if (role === 'vendor') {
    return <VendorOnboarding open={open} onOpenChange={setOpen} />;
  }

  return null;
}
