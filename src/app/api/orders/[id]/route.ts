import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

type Ctx = { params: Promise<{ id: string }> };

// RLS limits visibility to the buyer or the owning vendor.
export const GET = withErrorBoundary(async (_request: NextRequest, { params }: Ctx) => {
  const { supabase } = await requireUser();
  const { id } = await params;

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Order not found');

  return NextResponse.json({ data });
});
