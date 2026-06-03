import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendClaimRequestTeamEmail,
  sendClaimRequestVendorEmail,
  sendRemovalRequestTeamEmail,
  sendRemovalConfirmationVendorEmail,
} from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const bodySchema = z.object({
  action: z.enum(['remove', 'claim_request']),
  requester_email: z.string().email(),
  requester_name: z.string().nullable().optional(),
  requester_ig: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

const paramsSchema = z.object({
  id: z.string().regex(UUID_REGEX),
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

  const vendorId = paramsParsed.data.id;
  const body = parsed.data;
  const supabase = await createServiceRoleClient();

  const { data: vendor } = await supabase
    .from('scraped_vendors')
    .select('business_name')
    .eq('id', vendorId)
    .maybeSingle();

  if (!vendor) {
    return NextResponse.json({ error: 'vendor not found' }, { status: 404 });
  }
  const businessName = (vendor as { business_name: string }).business_name;

  const { data: insertResult } = await supabase
    .from('scraped_vendor_requests')
    .insert({
      scraped_vendor_id: vendorId,
      action: body.action,
      requester_name: body.requester_name ?? null,
      requester_email: body.requester_email,
      requester_ig: body.requester_ig ?? null,
      reason: body.reason ?? null,
    })
    .select('id')
    .single();

  if (body.action === 'remove') {
    await supabase
      .from('scraped_vendors')
      .update({ disputed_at: new Date().toISOString() })
      .eq('id', vendorId);
    await Promise.all([
      sendRemovalRequestTeamEmail(
        businessName,
        body.requester_name ?? null,
        body.requester_email,
        body.reason ?? null,
        vendorId
      ),
      sendRemovalConfirmationVendorEmail(body.requester_email, businessName),
    ]);
  } else {
    await Promise.all([
      sendClaimRequestTeamEmail(
        businessName,
        body.requester_name ?? null,
        body.requester_email,
        body.requester_ig ?? null,
        vendorId
      ),
      sendClaimRequestVendorEmail(body.requester_email, businessName),
    ]);
  }

  return NextResponse.json({
    ok: true,
    requestId: (insertResult as { id: string } | null)?.id ?? null,
  });
}
