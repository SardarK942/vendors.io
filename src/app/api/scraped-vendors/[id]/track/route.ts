import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logEngagement } from '@/lib/scraped-vendor/engagement';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  event: z.enum(['view', 'ig_click']),
});

const paramsSchema = z.object({
  id: z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      'Invalid UUID'
    ),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  const rawParams = await params;
  const paramsParsed = paramsSchema.safeParse(rawParams);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  // Pull IP from standard forwarded headers; falls back to a placeholder for tests.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  await logEngagement(paramsParsed.data.id, parsed.data.event, ip, userAgent);
  return NextResponse.json({ ok: true });
}
