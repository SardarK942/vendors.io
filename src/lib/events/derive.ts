// Pure domain logic for customer events. No I/O — unit-testable.
// Spec: docs/superpowers/specs/2026-07-18-customer-events-design.md §1.
import type { BookingStatus } from '@/types';
import type { EventVendorNeedRow, EventTaskRow, EventFunctionRow } from '@/types/database.types';

export type NeedStatus = 'booked_baazar' | 'booked_manual' | 'needed';

export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'deposit_paid',
  'completed',
  'accepted',
  'adjusted_quote_sent',
] as const;

export interface NeedWithBooking extends EventVendorNeedRow {
  booking?: {
    id: string;
    status: string;
    total_price_cents: number | null;
    vendor_business_name?: string | null;
  } | null;
}

function bookingIsActive(need: NeedWithBooking): boolean {
  return Boolean(
    need.booking_id &&
    need.booking &&
    (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(need.booking.status)
  );
}

export function deriveNeedStatus(need: NeedWithBooking): NeedStatus {
  if (bookingIsActive(need)) return 'booked_baazar';
  if (need.manual_booked) return 'booked_manual';
  return 'needed';
}

export function committedCentsForNeed(need: NeedWithBooking): number {
  if (bookingIsActive(need)) return need.booking?.total_price_cents ?? 0;
  if (need.manual_booked) return need.manual_amount_cents ?? 0;
  return 0;
}

export interface Rollups {
  totalCommittedCents: number;
  byFunction: Record<string, number>;
  byCategory: Record<string, number>;
  bookedCountByFunction: Record<string, { booked: number; total: number }>;
}

export function computeRollups(needs: NeedWithBooking[]): Rollups {
  const r: Rollups = {
    totalCommittedCents: 0,
    byFunction: {},
    byCategory: {},
    bookedCountByFunction: {},
  };
  for (const need of needs) {
    const cents = committedCentsForNeed(need);
    r.totalCommittedCents += cents;
    r.byFunction[need.event_function_id] = (r.byFunction[need.event_function_id] ?? 0) + cents;
    r.byCategory[need.category] = (r.byCategory[need.category] ?? 0) + cents;
    const counts = (r.bookedCountByFunction[need.event_function_id] ??= { booked: 0, total: 0 });
    counts.total += 1;
    if (deriveNeedStatus(need) !== 'needed') counts.booked += 1;
  }
  return r;
}

const MS_PER_DAY = 86_400_000;

export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((Date.parse(dateIso) - Date.parse(todayIso)) / MS_PER_DAY);
}

const DUE_SOON_WINDOW_DAYS = 3;

export function selectDueSoonTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[] {
  return tasks.filter((t) => {
    if (!t.due_date || t.completed_at || t.due_soon_notified_at) return false;
    const d = daysUntil(t.due_date, todayIso);
    return d >= 0 && d <= DUE_SOON_WINDOW_DAYS;
  });
}

export function selectOverdueTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[] {
  return tasks.filter(
    (t) =>
      Boolean(t.due_date) &&
      !t.completed_at &&
      !t.overdue_notified_at &&
      daysUntil(t.due_date!, todayIso) < 0
  );
}

export const COUNTDOWN_MILESTONES: readonly number[] = [30, 14, 7, 1] as const;

export function selectCountdownFunctions(
  fns: EventFunctionRow[],
  todayIso: string
): { fn: EventFunctionRow; daysOut: number }[] {
  const out: { fn: EventFunctionRow; daysOut: number }[] = [];
  for (const f of fns) {
    if (!f.date) continue;
    const daysOut = daysUntil(f.date, todayIso);
    if (COUNTDOWN_MILESTONES.includes(daysOut)) out.push({ fn: f, daysOut });
  }
  return out;
}
