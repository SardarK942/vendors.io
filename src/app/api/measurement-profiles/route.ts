import { NextRequest, NextResponse } from 'next/server';
import { getMeasurementProfiles, createMeasurementProfile } from '@/services/measurements.service';
import { measurementProfileSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const GET = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();

  const result = await getMeasurementProfiles(supabase, user.id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
});

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const body = await request.json();
  const parsed = measurementProfileSchema.parse(body);

  const result = await createMeasurementProfile(supabase, user.id, parsed);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
