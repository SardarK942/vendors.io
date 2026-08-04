import { NextRequest, NextResponse } from 'next/server';
import { createEventWithGraph } from '@/services/events.service';
import { createEventSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const gate = await checkRateLimit(
    request,
    'events:create',
    { limit: 10, window: '1 h' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const parsed = createEventSchema.parse(await request.json());
  const result = await createEventWithGraph(supabase, user.id, parsed);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data, { status: 201 });
});
