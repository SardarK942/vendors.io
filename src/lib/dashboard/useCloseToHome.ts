'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Closes the booking detail panel.
 * - History exists → router.back() returns the user to where they came from.
 * - Direct-URL arrival or refresh → router.push('/dashboard') as a clean fallback.
 */
export function useCloseToHome() {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  }, [router]);
}
