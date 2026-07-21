// Smart-hybrid toast strategy (spec §4.6).
// Types listed here fire a sonner toast on realtime arrival (action-required or
// money-moved events) and sort into the action tab. All other notification types
// update the bell badge silently. Toasts only fire for events received via the
// realtime channel — never for notifications loaded via the initial fetch on
// bell mount. Membership here does NOT trigger email — email delivery is wired
// explicitly at each call site (see payment.service.ts notifyDepositPaid +
// sendDepositConfirmationEmail pairing).

import type { NotificationType } from '@/types/database.types';

export const HIGH_PRIORITY_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'booking_request_received',
  'deposit_paid',
  'vendor_adjusted_quote',
  'couple_declined_adjusted',
  'booking_confirmed',
  'event_task_overdue',
  'event_countdown',
]);

export function isHighPriority(type: NotificationType): boolean {
  return HIGH_PRIORITY_TYPES.has(type);
}
