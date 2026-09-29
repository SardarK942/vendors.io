import { NextRequest, NextResponse } from 'next/server';
import {
  updateMeasurementProfile,
  deleteMeasurementProfile,
} from '@/services/measurements.service';
import { updateMeasurementProfileSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();

    const body = await request.json();
    const parsed = updateMeasurementProfileSchema.parse(body);

    const result = await updateMeasurementProfile(supabase, params.id, user.id, parsed);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);

export const DELETE = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();

    const result = await deleteMeasurementProfile(supabase, params.id, user.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
