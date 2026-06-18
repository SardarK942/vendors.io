import type { Database, NotificationType } from '@/types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export type ActionVariant = 'primary' | 'secondary' | 'destructive';

export interface ActionConfig {
  label: string;
  variant: ActionVariant;
  href: (n: NotificationRow) => string;
}

// couple_countered is not yet in the DB enum (arrives in T12 migration).
// We union it in here so the map can be pre-populated without TS errors.
type AnyNotificationType = NotificationType | 'couple_countered';

export type ActionMap = Partial<Record<AnyNotificationType, ActionConfig[]>>;

// ─── href helpers ────────────────────────────────────────────────────────────

function bookingHref(n: NotificationRow, action?: string): string {
  const meta = n.metadata as { booking_id?: string } | null;
  const id = meta?.booking_id ?? '';
  return action ? `/dashboard/bookings/${id}?action=${action}` : `/dashboard/bookings/${id}`;
}

// ─── Action helper with role discrimination ────────────────────────────────────

export function getActionsFor(n: NotificationRow): ActionConfig[] {
  if (n.type === 'booking_completed') {
    const meta = n.metadata as { booking_id?: string; recipient_role?: string } | null;
    const recipientRole = meta?.recipient_role;

    if (recipientRole === 'vendor') {
      return [{ label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) }];
    }
    // Couple (default): Leave Review
    return [
      { label: 'Leave Review', variant: 'primary', href: (n) => bookingHref(n, 'leave-review') },
    ];
  }

  return NOTIFICATION_ACTIONS[n.type as keyof ActionMap] ?? [];
}

// ─── Action map ───────────────────────────────────────────────────────────────

export const NOTIFICATION_ACTIONS: ActionMap = {
  booking_request_received: [
    { label: 'Accept', variant: 'primary', href: (n) => bookingHref(n, 'accept') },
    { label: 'Adjust', variant: 'secondary', href: (n) => bookingHref(n, 'adjust') },
    { label: 'Decline', variant: 'destructive', href: (n) => bookingHref(n, 'decline') },
  ],

  vendor_accepted: [
    { label: 'Pay Deposit', variant: 'primary', href: (n) => bookingHref(n, 'pay-deposit') },
  ],

  vendor_adjusted_quote: [
    { label: 'Accept', variant: 'primary', href: (n) => bookingHref(n, 'accept') },
    { label: 'Counter', variant: 'secondary', href: (n) => bookingHref(n, 'counter') },
    { label: 'Decline', variant: 'destructive', href: (n) => bookingHref(n, 'decline') },
  ],

  // couple_countered pre-declared before T12 DB migration adds the enum value.
  couple_countered: [
    { label: 'Accept', variant: 'primary', href: (n) => bookingHref(n, 'accept') },
    { label: 'Adjust', variant: 'secondary', href: (n) => bookingHref(n, 'adjust') },
    { label: 'Decline', variant: 'destructive', href: (n) => bookingHref(n, 'decline') },
  ],

  couple_accepted_adjusted: [
    { label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) },
  ],

  couple_declined_adjusted: [
    { label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) },
  ],

  deposit_paid: [{ label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) }],

  booking_confirmed: [{ label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) }],

  booking_auto_cancelled: [
    { label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) },
  ],

  booking_cancelled: [{ label: 'View booking', variant: 'secondary', href: (n) => bookingHref(n) }],

  event_completed: [{ label: 'View booking', variant: 'primary', href: (n) => bookingHref(n) }],

  // Role-discriminated in getActionsFor (vendor sees View booking, couple sees Leave Review).
  booking_completed: [
    { label: 'Leave Review', variant: 'primary', href: (n) => bookingHref(n, 'leave-review') },
  ],

  review_received: [
    { label: 'View Review', variant: 'primary', href: (n) => bookingHref(n, 'view-review') },
  ],

  custom_request_received: [
    { label: 'Send Quote', variant: 'primary', href: (n) => bookingHref(n, 'send-quote') },
    { label: 'Decline', variant: 'destructive', href: (n) => bookingHref(n, 'decline') },
  ],
};
