import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import { createSubmission } from '@/lib/docuseal/client';
import { formatAgreedPrice, formatEventSchedule, prefillSchema } from '@/lib/docuseal/prefill';
import { sendContractSigningRequestEmail } from '@/lib/email/resend';
import { logger } from '@/lib/logger';

type Client = SupabaseClient<Database>;
type ContractRow = Database['public']['Tables']['booking_contracts']['Row'];

export type CreateForBookingResult = { contractId: string; status: string };

const CONTRACT_TTL_DAYS = 14;
const MAX_BACKOFF_MINUTES = 60;

/** Exponential backoff: 2^attempt minutes, capped. */
function backoffMinutes(attempt: number): number {
  return Math.min(2 ** attempt, MAX_BACKOFF_MINUTES);
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function ok(row: Pick<ContractRow, 'id' | 'status'>): ServiceResult<CreateForBookingResult> {
  return { data: { contractId: row.id, status: row.status }, status: 200 };
}

/** Existing row is "done" if a submission exists or it has moved beyond pending/failed. */
function isAlreadyCreated(row: ContractRow): boolean {
  return (
    Boolean(row.docuseal_submission_id) || (row.status !== 'pending' && row.status !== 'failed')
  );
}

async function markFailed(
  supabase: Client,
  contractId: string,
  prevAttempts: number,
  message: string,
  permanent: boolean
): Promise<void> {
  const attempt = prevAttempts + 1;
  const { error } = await supabase
    .from('booking_contracts')
    .update({
      status: 'failed',
      error: message,
      error_permanent: permanent,
      attempt_count: attempt,
      next_retry_at: permanent
        ? null
        : new Date(Date.now() + backoffMinutes(attempt) * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId);
  if (error)
    logger.error('docuseal.createForBooking: failed to record failure', error, { contractId });
}

/**
 * Create the DocuSeal contract for a booking (called when the deposit is paid).
 * Never throws. Idempotent on submission existence: a row that already has a
 * docuseal_submission_id (or has advanced past pending/failed) is returned as-is
 * with no second DocuSeal call; a `failed` row with no submission is retried.
 * Price: bookings.total_price_cents (the only price column; vendor_quote_amount was dropped).
 */
export async function createForBooking(
  supabase: Client,
  bookingId: string
): Promise<ServiceResult<CreateForBookingResult>> {
  try {
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select(
        'id, total_price_cents, couple_full_name, couple_email, users!couple_user_id(full_name, email), vendor_profiles!inner(id, business_name, docuseal_template_id, users!user_id(email))'
      )
      .eq('id', bookingId)
      .single();
    if (bErr || !booking) return { error: 'Booking not found', status: 404 };

    const vendor = one(booking.vendor_profiles) as unknown as {
      id: string;
      business_name: string;
      docuseal_template_id: string | null;
      users: { email: string } | { email: string }[] | null;
    } | null;
    if (!vendor) return { error: 'Vendor not found', status: 404 };
    const vendorEmail = one(vendor.users)?.email ?? null;
    const coupleUser = one(
      booking.users as unknown as
        | { full_name: string | null; email: string | null }
        | { full_name: string | null; email: string | null }[]
        | null
    );
    const coupleName = booking.couple_full_name ?? coupleUser?.full_name ?? '';
    const coupleEmail = booking.couple_email ?? coupleUser?.email ?? null;

    // Ensure the row exists (UNIQUE(booking_id) makes concurrent inserts safe).
    let { data: contract } = await supabase
      .from('booking_contracts')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (!contract) {
      const ins = await supabase
        .from('booking_contracts')
        .insert({ booking_id: bookingId, vendor_profile_id: vendor.id, status: 'pending' })
        .select('*')
        .single();
      if (ins.data) {
        contract = ins.data;
      } else {
        // Lost a race on UNIQUE(booking_id): re-read the winner's row.
        const again = await supabase
          .from('booking_contracts')
          .select('*')
          .eq('booking_id', bookingId)
          .maybeSingle();
        contract = again.data;
      }
    }
    if (!contract) return { error: 'Could not create contract row', status: 500 };
    if (isAlreadyCreated(contract)) return ok(contract);

    const fail = async (message: string, permanent: boolean, status: number) => {
      await markFailed(supabase, contract.id, contract.attempt_count, message, permanent);
      return { error: message, status } as ServiceResult<CreateForBookingResult>;
    };

    const templateId = vendor.docuseal_template_id ?? process.env.DOCUSEAL_DEFAULT_TEMPLATE_ID;
    if (!templateId) return fail('No DocuSeal template configured for vendor', true, 422);

    const priceCents = booking.total_price_cents;
    if (!priceCents || priceCents <= 0) return fail('No agreed price on booking', true, 422);

    const { data: events } = await supabase
      .from('booking_events')
      .select('event_type_label, event_date')
      .eq('booking_id', bookingId);
    const eventSchedule = formatEventSchedule(
      (events ?? []).map((e) => ({ eventType: e.event_type_label, eventDate: e.event_date }))
    );

    const prefill = prefillSchema.safeParse({
      agreedPrice: formatAgreedPrice(priceCents),
      eventSchedule,
      coupleName,
      vendorName: vendor.business_name,
    });
    if (!prefill.success) return fail('Contract prefill invalid', true, 422);
    if (!vendorEmail || !coupleEmail) return fail('Missing signer email', true, 422);

    const fields = [
      { name: 'agreed_price', defaultValue: prefill.data.agreedPrice, readonly: true },
      { name: 'event_schedule', defaultValue: prefill.data.eventSchedule, readonly: true },
      { name: 'couple_name', defaultValue: prefill.data.coupleName },
      { name: 'vendor_name', defaultValue: prefill.data.vendorName },
    ];
    const expiresAt = new Date(Date.now() + CONTRACT_TTL_DAYS * 86_400_000).toISOString();

    let result;
    try {
      result = await createSubmission({
        templateId,
        order: 'preserved',
        sendEmail: false,
        expireAt: expiresAt,
        // Vendor FIRST: the client sends by array position under order:'preserved'.
        submitters: [
          {
            role: 'Vendor',
            name: vendor.business_name,
            email: vendorEmail,
            externalId: `${bookingId}:vendor`,
            order: 1,
            fields,
          },
          {
            role: 'Couple',
            name: prefill.data.coupleName,
            email: coupleEmail,
            externalId: `${bookingId}:couple`,
            order: 2,
            fields,
          },
        ],
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'DocuSeal request failed', false, 502);
    }

    const vendorSlug = result.submitters.find((s) => s.role === 'Vendor')?.slug ?? null;
    const coupleSlug = result.submitters.find((s) => s.role === 'Couple')?.slug ?? null;

    const { error: uErr } = await supabase
      .from('booking_contracts')
      .update({
        docuseal_submission_id: result.submissionId,
        vendor_slug: vendorSlug,
        couple_slug: coupleSlug,
        template_id_used: templateId,
        expires_at: expiresAt,
        status: 'sent_vendor',
        error: null,
        error_permanent: false,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id);
    if (uErr) {
      logger.error('docuseal.createForBooking: persist failed after submission created', uErr, {
        bookingId,
      });
      return { error: 'Failed to persist contract', status: 500 };
    }

    if (vendorSlug) {
      // DocuSeal hosted signer path; reconfirmed at integration.
      const base = (process.env.DOCUSEAL_API_URL ?? '').replace(/\/+$/, '');
      await sendContractSigningRequestEmail(vendorEmail, 'vendor', `${base}/s/${vendorSlug}`, {
        vendorName: vendor.business_name,
        eventSchedule: prefill.data.eventSchedule,
      }).catch(() => false);
    }

    return { data: { contractId: contract.id, status: 'sent_vendor' }, status: 201 };
  } catch (e) {
    logger.error('docuseal.createForBooking: unexpected error', e, { bookingId });
    return { error: e instanceof Error ? e.message : 'Unexpected error', status: 500 };
  }
}
