import type { NotificationType } from '@/types/database.types';

/**
 * The 5 notification types that are "high priority" — they warrant a toast
 * on realtime arrival (F3) and appear in the "Action needed" tab (F4).
 *
 * Used by NotificationBell (F3) and NotificationsPageClient (F4).
 */
export const HIGH_PRIORITY_TYPES: ReadonlySet<NotificationType> = new Set([
  'booking_request_received',
  'vendor_accepted',
  'vendor_adjusted_quote',
  'couple_accepted_adjusted',
  'deposit_paid',
] satisfies NotificationType[]);

export function isHighPriority(type: NotificationType): boolean {
  return HIGH_PRIORITY_TYPES.has(type);
}
