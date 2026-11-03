import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyDocusealWebhook } from '@/lib/docuseal/verify';
import { applyWebhookEvent, type DocusealEvent } from '@/services/docuseal.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';

/**
 * DocuSeal webhook body. RECONFIRM AT INTEGRATION against a live instance:
 * - submission id is read from `data.submission.id` (form.* events nest the
 *   submission); falls back to `data.submission_id`, then `data.id` (which is
 *   the submission id on submission.* events).
 * - `data.role` is the signing party's template role; `data.external_id` is
 *   the id we passed at creation.
 */
const idSchema = z.union([z.string().min(1), z.number()]).transform(String);

const payloadSchema = z.object({
  event_type: z.string().min(1),
  timestamp: z.string().optional(),
  data: z.object({
    id: idSchema.optional(),
    submission_id: idSchema.optional(),
    submission: z.object({ id: idSchema }).optional(),
    role: z.string().optional(),
    external_id: z.string().optional(),
  }),
});

interface ParsedWebhook {
  event: DocusealEvent;
  timestamp?: string;
}

function parseWebhook(rawBody: string): ParsedWebhook | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const { event_type, timestamp, data } = parsed.data;
  const submissionId = data.submission?.id ?? data.submission_id ?? data.id;
  if (!submissionId) return null;

  const event: DocusealEvent = { type: event_type, submissionId };
  if (data.role === 'Vendor' || data.role === 'Couple') event.role = data.role;
  if (data.external_id) event.externalId = data.external_id;
  return { event, timestamp };
}

/**
 * Deterministic dedup key (DocuSeal may not send a stable event id).
 * RECONFIRM AT INTEGRATION: if the live payload carries a unique event id, use it instead.
 */
function dedupKey({ event, timestamp }: ParsedWebhook): string {
  return `${event.type}:${event.submissionId}:${event.role ?? ''}:${timestamp ?? ''}`;
}

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const body = await request.text();

  const verified = verifyDocusealWebhook({
    rawBody: body,
    headers: request.headers,
    secret: process.env.DOCUSEAL_WEBHOOK_SECRET ?? '',
  });
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const parsed = parseWebhook(body);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const eventId = dedupKey(parsed);

  const { data: existing } = await supabase
    .from('docuseal_events')
    .select('handled_at')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing?.handled_at) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  if (!existing) {
    await supabase.from('docuseal_events').insert({
      event_id: eventId,
      event_type: parsed.event.type,
      payload: JSON.parse(body) as Record<string, unknown>,
    });
  }

  let handlerError: string | null = null;
  try {
    const result = await applyWebhookEvent(supabase, parsed.event);
    if (result.error) handlerError = result.error;
  } catch (err) {
    handlerError = err instanceof Error ? err.message : String(err);
    console.error(`[DocuSeal Webhook] handler failed for ${eventId}:`, err);
  }

  // handled_at only on success so DocuSeal's retry re-runs the handler.
  await supabase
    .from('docuseal_events')
    .update({
      handled_at: handlerError ? null : new Date().toISOString(),
      error: handlerError,
    })
    .eq('event_id', eventId);

  if (handlerError) {
    return NextResponse.json({ error: handlerError }, { status: 500 });
  }
  return NextResponse.json({ received: true }, { status: 200 });
});
