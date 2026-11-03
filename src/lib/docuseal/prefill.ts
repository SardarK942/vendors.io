import { z } from 'zod';
import { EVENT_TYPES } from '@/types';

export type PrefillValues = {
  agreedPrice: string;
  eventSchedule: string;
  coupleName: string;
  vendorName: string;
};

export const prefillSchema: z.ZodType<PrefillValues> = z.object({
  agreedPrice: z.string().min(1),
  eventSchedule: z.string().min(1),
  coupleName: z.string().min(1),
  vendorName: z.string().min(1),
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function eventLabel(eventType: string): string {
  const known = EVENT_TYPES.find((e) => e.id === eventType);
  if (known) return known.label;
  return eventType
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Format a YYYY-MM-DD string from its parts (no Date parsing, so no UTC day shift). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const month = MONTHS[(m ?? 1) - 1] ?? '';
  return `${month} ${d}, ${y}`;
}

export function formatEventSchedule(
  events: Array<{ eventType: string; eventDate: string }>
): string {
  return [...events]
    .sort((a, b) => a.eventDate.slice(0, 10).localeCompare(b.eventDate.slice(0, 10)))
    .map((e) => `${eventLabel(e.eventType)} — ${formatDate(e.eventDate)}`)
    .join('\n');
}

export function formatAgreedPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
