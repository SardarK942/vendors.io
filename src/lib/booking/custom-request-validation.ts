import { z } from 'zod';

export const EVENT_TYPES = [
  'mehndi',
  'sangeet',
  'ceremony',
  'reception',
  'welcome-dinner',
  'farewell-brunch',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ISO YYYY-MM-DD shape check. Date semantics (future-only) are enforced by
// the API route + the DatePicker primitive (disabled:{before: today}).
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const customRequestSchema = z.object({
  vendor_slug: z.string().min(1).max(120),
  event_date: z.string().regex(ISO_DATE_RE, 'Expected YYYY-MM-DD'),
  guest_count: z.number().int().min(1).max(2000),
  event_type: z.enum(EVENT_TYPES),
  description: z.string().min(50).max(1000),
});

export type CustomRequestInput = z.infer<typeof customRequestSchema>;
