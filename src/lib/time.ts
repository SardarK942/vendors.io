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
