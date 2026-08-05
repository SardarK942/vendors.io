'use client';

import { useState } from 'react';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { SignupForm } from './signup-form';
import type { UserRole } from '@/types';

interface Props {
  returnTo: string | null;
  prefilledRole: UserRole | null;
  claimContext: { businessName: string } | null;
}

/**
 * Client shell for the signup page: owns the selected `role` so the left brand
 * panel follows the couple/vendor picker in the form. The panel is 'vendor' only
 * when vendor is selected; otherwise it shows the couple register (also the
 * default before any pick). Switching is a cheap client re-render — no reload.
 */
export function SignupExperience({ returnTo, prefilledRole, claimContext }: Props) {
  const [role, setRole] = useState<UserRole | null>(prefilledRole);
  const panelVariant = role === 'vendor' ? 'vendor' : 'couple';

  return (
    <AuthSplitLayout variant={panelVariant}>
      <SignupForm
        returnTo={returnTo}
        prefilledRole={prefilledRole}
        claimContext={claimContext}
        role={role}
        setRole={setRole}
      />
    </AuthSplitLayout>
  );
}
