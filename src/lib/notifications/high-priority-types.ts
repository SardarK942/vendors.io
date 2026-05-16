/**
 * high-priority-types.ts
 *
 * The 5 notification types that trigger a sonner toast on live realtime arrival
 * (see spec §4.6). All other types update the bell badge silently.
 *
 * Used by NotificationBell to decide whether to call toast.success() when a new
 * notification arrives via the realtime subscription.
 */

import type { NotificationType } from '@/types/database.types';

export const HIGH_PRIORITY_NOTIFICATION_TYPES = new Set<NotificationType>([
  'booking_request_received', // vendor must respond
  'deposit_paid',             // money has moved, booking is locked in
  'vendor_adjusted_quote',    // couple must accept/decline
  'couple_declined_adjusted', // vendor must re-quote within 72h
  'booking_confirmed',        // couple's deposit succeeded, address now visible
]);

export function isHighPriority(type: NotificationType): boolean {
  return HIGH_PRIORITY_NOTIFICATION_TYPES.has(type);
}
