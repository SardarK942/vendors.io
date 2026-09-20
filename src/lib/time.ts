/**
 * Snap an `HH:mm` (24h) time string to the nearest 15-minute mark.
 *
 * Minutes round to the nearest of {0, 15, 30, 45}. Ties/boundaries follow
 * standard round-half-up (e.g. 8 -> 15, 7 -> 0, 22 -> 15, 23 -> 30, 52 -> 45).
 *
 * Minutes 53-59 round up to `:00` of the next hour (e.g. '09:53' -> '10:00').
 *
 * Clamp choice: to keep the result a valid *same-day* time we never roll past
 * 23:59 into the next day. When the next hour would be 24, we hold the hour at
 * 23 and use `:00` (so '23:53' -> '23:00'). Rolling forward to '00:00' would
 * silently jump to the previous day's start and misrepresent the user's intent
 * in a same-day event/booking context, so we clamp instead.
 *
 * Anything that isn't a well-formed `HH:mm` (empty string, malformed text,
 * out-of-range fields) is returned unchanged so callers never crash.
 */
export function snapTimeToQuarterHour(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return hhmm;

  const rounded = Math.round(minutes / 15) * 15; // 0, 15, 30, 45, or 60

  let outHours = hours;
  let outMinutes = rounded;
  if (rounded === 60) {
    outMinutes = 0;
    // Clamp at the final hour: never roll 23:59 into the next day.
    outHours = hours < 23 ? hours + 1 : 23;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(outHours)}:${pad(outMinutes)}`;
}

/**
 * Format an `HH:mm` (24h) string as a 12-hour clock label, e.g.
 * '16:00' -> '4:00 PM', '00:00' -> '12:00 AM', '12:30' -> '12:30 PM'.
 *
 * Anything that isn't a well-formed, in-range `HH:mm` (empty string, malformed
 * text, out-of-range fields) returns '' so callers can fall back to a
 * placeholder rather than render garbage.
 */
export function to12h(hhmm: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return '';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';

  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** A selectable 15-minute time slot: `value` is 24h `HH:mm`, `label` is 12h. */
export interface QuarterHourSlot {
  value: string;
  label: string;
}

/**
 * The 96 quarter-hour slots of a day, 00:00 -> 23:45, each with its 24h
 * `value` and 12h `label`. Stable module-scope array — safe to reference
 * directly in render without regenerating.
 */
export const QUARTER_HOUR_SLOTS: readonly QuarterHourSlot[] = Array.from({ length: 96 }, (_, i) => {
  const hours = Math.floor(i / 4);
  const minutes = (i % 4) * 15;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { value, label: to12h(value) };
});
