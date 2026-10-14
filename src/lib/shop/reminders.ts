// Pure selector for the mid-window "confirm this order" reminder. No IO.

const HOUR_MS = 60 * 60 * 1000;

export interface ReminderCandidate {
  status: string;
  confirm_deadline_at: string;
}

/**
 * Select pending_confirmation orders whose remaining time to
 * confirm_deadline_at is in the window (23h, 24h]. With an hourly cron each
 * order falls in this 1h window exactly once, so one reminder fires per order.
 */
export function selectReminderOrders<T extends ReminderCandidate>(orders: T[], now: Date): T[] {
  return orders.filter((o) => {
    if (o.status !== 'pending_confirmation') return false;
    const remaining = new Date(o.confirm_deadline_at).getTime() - now.getTime();
    return remaining <= 24 * HOUR_MS && remaining > 23 * HOUR_MS;
  });
}
