import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();
    const gate = await checkRateLimit(
      request,
      'events:tasks',
      { limit: 120, window: '1 h' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);
    const parsed = z
      .object({
        title: z.string().min(1).max(200),
        due_date: isoDate.nullable().optional(),
        event_function_id: z.string().uuid().nullable().optional(),
      })
      .parse(await request.json());

    if (parsed.event_function_id) {
      const { data: fn } = await supabase
        .from('event_functions')
        .select('id')
        .eq('id', parsed.event_function_id)
        .eq('event_id', id)
        .maybeSingle();
      if (!fn) throw new HttpError(400, 'function does not belong to this event');
    }

    const { error } = await supabase.from('event_tasks').insert({
      event_id: id,
      title: parsed.title,
      due_date: parsed.due_date ?? null,
      event_function_id: parsed.event_function_id ?? null,
    });
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true });
  }
);

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const parsed = z
    .object({
      task_id: z.string().uuid(),
      completed: z.boolean().optional(),
      title: z.string().min(1).max(200).optional(),
      due_date: isoDate.nullable().optional(),
    })
    .parse(await request.json());
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.completed !== undefined)
    update.completed_at = parsed.completed ? new Date().toISOString() : null;
  if (parsed.title !== undefined) update.title = parsed.title;
  if (parsed.due_date !== undefined) update.due_date = parsed.due_date;
  const { error } = await supabase.from('event_tasks').update(update).eq('id', parsed.task_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});

export const DELETE = withErrorBoundary(async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const { task_id } = z.object({ task_id: z.string().uuid() }).parse(await request.json());
  const { error } = await supabase.from('event_tasks').delete().eq('id', task_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});
