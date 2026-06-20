import { z } from 'zod';
import { EVENT_TYPES } from '@/types';

// Re-export canonical EVENT_TYPES so that consumers of this module get the
// full 20-entry list (previously this module had its own 7-entry local array).
export { EVENT_TYPES } from '@/types';
export type EventTypeId = (typeof EVENT_TYPES)[number]['id'];

// Legacy alias kept so imports like `EventType` from this module still compile.
/** @deprecated Use EventTypeId from '@/types' instead. */
export type EventType = EventTypeId;

// ISO YYYY-MM-DD shape check. Date semantics (future-only) are enforced by
// the API route + the DatePicker primitive (disabled:{before: today}).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const customRequestSchema = z.object({
  vendor_slug: z.string().min(1).max(120),
  event_date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  guest_count: z.number().int().min(1).max(2000),
  event_type: z.enum(EVENT_TYPES.map((e) => e.id) as [string, ...string[]]),
  description: z.string().min(50).max(1000),
});

export type CustomRequestInput = z.infer<typeof customRequestSchema>;
