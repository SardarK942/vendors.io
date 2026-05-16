// Smart-hybrid toast strategy (spec §4.6).
// These 5 types fire a sonner toast on realtime arrival (action-required or
// money-moved events); the other 7 types update the bell badge silently.
// Toasts only fire for events received via the realtime channel — never for
// notifications loaded via the initial fetch on bell mount.

import type { NotificationType } from '@/types/database.types';

export const HIGH_PRIORITY_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'booking_request_received',
  'deposit_paid',
  'vendor_adjusted_quote',
  'couple_declined_adjusted',
  'booking_confirmed',
]);

export function isHighPriority(type: NotificationType): boolean {
  return HIGH_PRIORITY_TYPES.has(type);
}
