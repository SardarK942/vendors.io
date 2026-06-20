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

const EVENT_TYPE_IDS = EVENT_TYPES.map((e) => e.id) as [string, ...string[]];

// V1 schema — kept for backwards-compat / existing tests.
export const customRequestSchema = z.object({
  vendor_slug: z.string().min(1).max(120),
  event_date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  guest_count: z.number().int().min(1).max(2000),
  event_type: z.enum(EVENT_TYPE_IDS),
  description: z.string().min(50).max(1000),
});

export type CustomRequestInput = z.infer<typeof customRequestSchema>;

// Per-event entry for the V2 multi-event payload.
export const customEventEntrySchema = z.object({
  date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  startTime: z.string().optional(),
  guestCount: z.number().int().min(1).max(2000),
  eventTypeId: z.enum(EVENT_TYPE_IDS),
});

export type CustomEventEntry = z.infer<typeof customEventEntrySchema>;

// V2 schema — used by CustomRequestForm (dynamic events list).
export const customRequestSchemaV2 = z.object({
  vendor_slug: z.string().min(1).max(120),
  events: z.array(customEventEntrySchema).min(1),
  description: z.string().min(50).max(1000),
});

export type CustomRequestInputV2 = z.infer<typeof customRequestSchemaV2>;
