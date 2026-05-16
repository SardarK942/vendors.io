// Smart-hybrid toast strategy (spec §4.6):
// these 5 types fire a sonner toast on realtime arrival; the other 7
// update the bell badge silently.

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
