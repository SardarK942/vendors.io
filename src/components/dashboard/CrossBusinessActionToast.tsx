// src/components/dashboard/CrossBusinessActionToast.tsx
//
// Sub-project I §8. Reads active business + booking's business; if cross-business,
// fires a sonner toast with action-aware text + [Switch] button. Used by vendor
// action handlers (accept, adjust quote, cancel, complete) to surface that the
// action took effect in a non-active business.
'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useActiveBusinessId } from '@/contexts/ActiveBusinessContext';

export type CrossBusinessAction = 'accept' | 'adjust' | 'cancel' | 'complete';

const TOAST_PREFIXES: Record<CrossBusinessAction, string> = {
  accept: 'Accepted.',
  adjust: 'Quote sent.',
  cancel: 'Cancelled.',
  complete: 'Marked complete.',
};

const TOAST_HINTS: Record<CrossBusinessAction, string> = {
  accept: 'see this in your Operations view',
  adjust: 'follow up',
  cancel: 'see this in your bookings',
  complete: 'confirm',
};

interface TriggerArgs {
  action: CrossBusinessAction;
  bookingBusinessId: string;
  bookingBusinessName: string;
}

/**
 * Hook returning a function that fires a cross-business toast IF the booking's
 * business differs from the caller's active business. Otherwise a no-op.
 */
export function useCrossBusinessActionToast() {
  const activeBusinessId = useActiveBusinessId();
  const router = useRouter();

  return ({ action, bookingBusinessId, bookingBusinessName }: TriggerArgs) => {
    if (!activeBusinessId || activeBusinessId === bookingBusinessId) return;

    toast(
      `${TOAST_PREFIXES[action]} Switch to ${bookingBusinessName} to ${TOAST_HINTS[action]}.`,
      {
        duration: 8000,
        action: {
          label: 'Switch',
          onClick: async () => {
            try {
              await fetch('/api/users/me/active-business', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorProfileId: bookingBusinessId }),
              });
            } catch {
              // ignore — user can manually switch via the topbar pill
            }
            router.refresh();
          },
        },
      }
    );
  };
}
