import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import {
  archiveSubmission,
  createSubmission,
  downloadArtifact,
  getSubmission,
} from '@/lib/docuseal/client';
import { storeContractArtifact } from '@/lib/storage/contracts-store';
import { formatAgreedPrice, formatEventSchedule, prefillSchema } from '@/lib/docuseal/prefill';
import {
  sendContractReminderEmail,
  sendContractSignedCopyEmail,
  sendContractSigningRequestEmail,
} from '@/lib/email/resend';
import { selectSweepActions, type ContractSweepRow } from '@/lib/contracts/sweep';
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

// ---------------------------------------------------------------------------
// Webhook event application, artifact storage, void
// ---------------------------------------------------------------------------

/** DocuSeal event-type strings. Reconfirm against the live instance at integration. */
export const DOCUSEAL_EVENT_FORM_COMPLETED = 'form.completed';
export const DOCUSEAL_EVENT_SUBMISSION_COMPLETED = 'submission.completed';
export const DOCUSEAL_EVENT_FORM_DECLINED = 'form.declined';

export type DocusealEvent = {
  type: string;
  submissionId: string;
  externalId?: string;
  role?: 'Vendor' | 'Couple';
};

type ContractStatus = ContractRow['status'];

const RANK: Partial<Record<ContractStatus, number>> = {
  pending: 0,
  sent_vendor: 1,
  sent_couple: 2,
  completed: 3,
};

const TERMINAL: ContractStatus[] = ['declined', 'expired', 'voided', 'failed'];

/** Forward-only rank. Terminals (declined/expired/voided/failed) are absorbing: -1. */
export function statusRank(status: string): number {
  return RANK[status as ContractStatus] ?? -1;
}

function isTerminal(status: string): boolean {
  return (TERMINAL as string[]).includes(status);
}

type Parties = {
  vendorName: string;
  vendorEmail: string | null;
  coupleEmail: string | null;
  eventSchedule: string;
};

async function loadParties(supabase: Client, bookingId: string): Promise<Parties | null> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, couple_email, users!couple_user_id(email), vendor_profiles!inner(business_name, users!user_id(email))'
    )
    .eq('id', bookingId)
    .single();
  if (!booking) return null;
  const vendor = one(booking.vendor_profiles) as unknown as {
    business_name: string;
    users: { email: string } | { email: string }[] | null;
  } | null;
  const coupleUser = one(
    booking.users as unknown as { email: string | null } | { email: string | null }[] | null
  );
  const { data: events } = await supabase
    .from('booking_events')
    .select('event_type_label, event_date')
    .eq('booking_id', bookingId);
  return {
    vendorName: vendor?.business_name ?? '',
    vendorEmail: one(vendor?.users)?.email ?? null,
    coupleEmail: booking.couple_email ?? coupleUser?.email ?? null,
    eventSchedule: formatEventSchedule(
      (events ?? []).map((e) => ({ eventType: e.event_type_label, eventDate: e.event_date }))
    ),
  };
}

/** Guarded forward update: only applies if the row is still in one of `from`. */
async function guardedUpdate(
  supabase: Client,
  id: string,
  from: ContractStatus[],
  patch: Database['public']['Tables']['booking_contracts']['Update']
): Promise<boolean> {
  const { data, error } = await supabase
    .from('booking_contracts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', from)
    .select('id');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length > 0 : true;
}

/**
 * Apply a normalized DocuSeal webhook event. Never throws. Forward-only and
 * idempotent: duplicate / out-of-order events return success with the current
 * status; terminal rows are never advanced. Storage/fetch failures on
 * submission.completed return an error (5xx) so DocuSeal retries.
 */
export async function applyWebhookEvent(
  supabase: Client,
  event: DocusealEvent
): Promise<ServiceResult<{ status: string }>> {
  try {
    const { data: contract } = await supabase
      .from('booking_contracts')
      .select('*')
      .eq('docuseal_submission_id', event.submissionId)
      .maybeSingle();
    if (!contract) return { error: 'Contract not found', status: 404 };
    const current = contract.status;
    const noop = (): ServiceResult<{ status: string }> => ({
      data: { status: current },
      status: 200,
    });
    if (isTerminal(current)) return noop();

    if (event.type === DOCUSEAL_EVENT_FORM_DECLINED) {
      if (current === 'completed') return noop();
      const applied = await guardedUpdate(
        supabase,
        contract.id,
        ['pending', 'sent_vendor', 'sent_couple'],
        {
          status: 'declined',
          declined_at: new Date().toISOString(),
        }
      );
      return { data: { status: applied ? 'declined' : current }, status: 200 };
    }

    if (event.type === DOCUSEAL_EVENT_FORM_COMPLETED) {
      if (event.role !== 'Vendor') return noop(); // couple completion is handled by submission.completed
      if (statusRank(current) >= statusRank('sent_couple')) return noop();
      const applied = await guardedUpdate(supabase, contract.id, ['pending', 'sent_vendor'], {
        status: 'sent_couple',
        vendor_signed_at: new Date().toISOString(),
      });
      if (!applied) return noop();
      const parties = await loadParties(supabase, contract.booking_id);
      if (parties?.coupleEmail && contract.couple_slug) {
        const base = (process.env.DOCUSEAL_API_URL ?? '').replace(/\/+$/, '');
        await sendContractSigningRequestEmail(
          parties.coupleEmail,
          'couple',
          `${base}/s/${contract.couple_slug}`,
          { vendorName: parties.vendorName, eventSchedule: parties.eventSchedule }
        ).catch(() => false);
      }
      return { data: { status: 'sent_couple' }, status: 200 };
    }

    if (event.type === DOCUSEAL_EVENT_SUBMISSION_COMPLETED) {
      if (current === 'completed') return noop();
      const detail = await getSubmission(event.submissionId);
      const doc = detail.documents[0];
      if (!doc || !detail.auditLogUrl) {
        return { error: 'Signed artifacts not available yet', status: 502 };
      }
      const [pdf, cert] = await Promise.all([
        downloadArtifact(doc.url),
        downloadArtifact(detail.auditLogUrl),
      ]);
      const signedKey = await storeContractArtifact({
        bookingId: contract.booking_id,
        kind: 'signed',
        body: pdf,
        contentType: 'application/pdf',
      });
      const certKey = await storeContractArtifact({
        bookingId: contract.booking_id,
        kind: 'certificate',
        body: cert,
        contentType: 'application/pdf',
      });
      const now = new Date().toISOString();
      const applied = await guardedUpdate(
        supabase,
        contract.id,
        ['pending', 'sent_vendor', 'sent_couple'],
        {
          status: 'completed',
          signed_pdf_key: signedKey,
          certificate_key: certKey,
          couple_signed_at: now,
          completed_at: now,
        }
      );
      if (!applied) return noop(); // lost a race to a terminal state
      const parties = await loadParties(supabase, contract.booking_id);
      if (parties) {
        const attachment = { filename: 'signed-contract.pdf', content: pdf };
        for (const to of [parties.vendorEmail, parties.coupleEmail]) {
          if (to) {
            await sendContractSignedCopyEmail(
              to,
              { vendorName: parties.vendorName },
              attachment
            ).catch(() => false);
          }
        }
      }
      return { data: { status: 'completed' }, status: 200 };
    }

    return noop(); // unknown event types are ignored
  } catch (e) {
    logger.error('docuseal.applyWebhookEvent: failed', e, { submissionId: event.submissionId });
    return { error: e instanceof Error ? e.message : 'Unexpected error', status: 500 };
  }
}

/** Void a non-terminal contract (archive in DocuSeal + mark voided). No-op if terminal/absent. */
export async function voidForBooking(
  supabase: Client,
  bookingId: string
): Promise<ServiceResult<void>> {
  try {
    const { data: contract } = await supabase
      .from('booking_contracts')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (!contract || isTerminal(contract.status) || contract.status === 'completed') {
      return { data: undefined, status: 200 };
    }
    if (contract.docuseal_submission_id) {
      await archiveSubmission(contract.docuseal_submission_id);
    }
    await guardedUpdate(supabase, contract.id, ['pending', 'sent_vendor', 'sent_couple'], {
      status: 'voided',
      voided_at: new Date().toISOString(),
    });
    return { data: undefined, status: 200 };
  } catch (e) {
    logger.error('docuseal.voidForBooking: failed', e, { bookingId });
    return { error: e instanceof Error ? e.message : 'Unexpected error', status: 500 };
  }
}

// ---------------------------------------------------------------------------
// Daily sweep: reminders, expiry, transient-failure retries
// ---------------------------------------------------------------------------

export type SweepCounts = { reminded: number; expired: number; retried: number };

type SweepCandidate = ContractSweepRow & {
  booking_id: string;
  docuseal_submission_id: string | null;
  vendor_slug: string | null;
  couple_slug: string | null;
};

/**
 * Run the contract sweep. Never throws. Each side-effect is isolated so one
 * failure never aborts the batch; counts reflect successes only. Reminder
 * stamps and expiry use guarded updates so a row that completed/voided
 * meanwhile is not clobbered.
 */
export async function runSweep(supabase: Client): Promise<ServiceResult<SweepCounts>> {
  try {
    const { data, error } = await supabase
      .from('booking_contracts')
      .select(
        'id, status, created_at, last_reminder_at, expires_at, error_permanent, attempt_count, next_retry_at, booking_id, docuseal_submission_id, vendor_slug, couple_slug'
      )
      .in('status', ['sent_vendor', 'sent_couple', 'failed']);
    if (error) return { error: error.message, status: 500 };

    const rows = (data ?? []) as unknown as SweepCandidate[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const now = new Date();
    const actions = selectSweepActions(rows, now);
    const counts: SweepCounts = { reminded: 0, expired: 0, retried: 0 };
    const base = (process.env.DOCUSEAL_API_URL ?? '').replace(/\/+$/, '');

    for (const { id, party } of actions.reminders) {
      const row = byId.get(id);
      try {
        if (!row) continue;
        const slug = party === 'vendor' ? row.vendor_slug : row.couple_slug;
        const parties = await loadParties(supabase, row.booking_id);
        const to = party === 'vendor' ? parties?.vendorEmail : parties?.coupleEmail;
        if (!parties || !to || !slug) continue;
        const sent = await sendContractReminderEmail(to, party, `${base}/s/${slug}`, {
          vendorName: parties.vendorName,
        });
        if (!sent) continue;
        const stamped = await guardedUpdate(supabase, id, [row.status as ContractStatus], {
          last_reminder_at: now.toISOString(),
        });
        if (stamped) counts.reminded++;
      } catch (e) {
        logger.error('docuseal.runSweep: reminder failed', e, { contractId: id });
      }
    }

    for (const id of actions.expiries) {
      const row = byId.get(id);
      try {
        if (!row) continue;
        if (row.docuseal_submission_id) await archiveSubmission(row.docuseal_submission_id);
        const applied = await guardedUpdate(supabase, id, ['sent_vendor', 'sent_couple'], {
          status: 'expired',
        });
        if (applied) counts.expired++;
      } catch (e) {
        logger.error('docuseal.runSweep: expiry failed', e, { contractId: id });
      }
    }

    for (const id of actions.retries) {
      const row = byId.get(id);
      try {
        if (!row) continue;
        const res = await createForBooking(supabase, row.booking_id);
        if (res.error) {
          logger.warn('docuseal.runSweep: retry did not succeed', {
            contractId: id,
            error: res.error,
          });
        } else {
          counts.retried++;
        }
      } catch (e) {
        logger.error('docuseal.runSweep: retry failed', e, { contractId: id });
      }
    }

    return { data: counts, status: 200 };
  } catch (e) {
    logger.error('docuseal.runSweep: unexpected error', e);
    return { error: e instanceof Error ? e.message : 'Unexpected error', status: 500 };
  }
}
