import * as React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import jwt from 'jsonwebtoken';
import { logger } from '@/lib/logger';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CustomerWelcomeTemplate } from './templates/customer-welcome';
import { Customer48hFollowupTemplate, SuggestedVendor } from './templates/customer-followup-48h';
import { VendorWelcomeTemplate } from './templates/vendor-welcome';
import { Vendor48hFollowupTemplate } from './templates/vendor-followup-48h';
import { VendorFirstBookingTemplate } from './templates/vendor-first-booking';

export type { SuggestedVendor };

const FROM_EMAIL = 'Baazar.io <noreply@baazar.io>';

export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const { error } = await client().emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      logger.error('[sendEmail] Resend error', error, { to: options.to, subject: options.subject });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[sendEmail] Exception', err, { to: options.to, subject: options.subject });
    return false;
  }
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

const FOOTER = '<p style="color:#888;font-size:12px;">— Baazar.io</p>';

// ─── Booking Request ──────────────────────────────────────────────────────────

/**
 * Fired when a couple submits a new booking request.
 * Recipient: vendor.
 */
export async function sendBookingRequestEmail(
  vendorEmail: string,
  vendorName: string,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: 'New Booking Request',
    html: `
      <h2>New Booking Request</h2>
      <p>Hi ${escapeHtml(vendorName)},</p>
      <p>You have a new booking request for one of your packages. Review it within 72 hours — accept at the package price or send an adjusted quote.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View Request</a></p>
      ${FOOTER}
    `,
  });
}

/**
 * Fired when a couple submits a new booking request.
 * Recipient: couple (confirmation receipt).
 */
export async function sendBookingReceiptEmail(
  coupleEmail: string,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: coupleEmail,
    subject: 'Booking Request Sent',
    html: `
      <h2>Your booking request is in</h2>
      <p>Your booking request has been sent to the vendor. They have 72 hours to respond — accept at the listed price or send an adjusted quote.</p>
      <p>You'll be emailed as soon as they respond.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View your booking</a></p>
      ${FOOTER}
    `,
  });
}

// ─── Quote / Acceptance ───────────────────────────────────────────────────────

/**
 * Legacy quote email — kept for backward-compat with old flow.
 * New flow uses sendVendorAcceptedEmail instead.
 */
export async function sendQuoteEmail(
  coupleEmail: string,
  vendorName: string,
  quoteAmount: number,
  _bookingId: string
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  return sendEmail({
    to: coupleEmail,
    subject: `Quote Received from ${safeName}`,
    html: `
      <h2>Quote Received</h2>
      <p>${safeName} has sent you a quote of <strong>${fmtUsd(quoteAmount)}</strong>.</p>
      <p>Log in to review the quote and secure your booking with a 5% deposit.</p>
      <p><a href="${appUrl()}/dashboard/bookings">View Quote</a></p>
      ${FOOTER}
    `,
  });
}

/**
 * Fired when a vendor accepts a booking at the package price.
 * Recipient: couple.
 */
export async function sendVendorAcceptedEmail(
  coupleEmail: string,
  vendorName: string,
  totalCents: number,
  depositCheckoutUrl: string
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  return sendEmail({
    to: coupleEmail,
    subject: `${safeName} accepted your booking`,
    html: `
      <h2>${safeName} accepted your booking</h2>
      <p>Total: <strong>${fmtUsd(totalCents)}</strong></p>
      <p>Pay your 5% deposit to confirm your booking. The vendor's full address and instructions will appear in your dashboard once the deposit is processed.</p>
      <p><a href="${depositCheckoutUrl}">Pay deposit</a></p>
      ${FOOTER}
    `,
  });
}

/**
 * Fired when a vendor sends an adjusted quote.
 * Recipient: couple.
 */
export async function sendAdjustedQuoteEmail(
  coupleEmail: string,
  vendorName: string,
  newTotalCents: number,
  reason: string,
  explanation: string | null,
  bookingId: string
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  const reasonLabel =
    (
      {
        travel: 'travel distance',
        guest_count: 'guest count over package',
        peak_date: 'peak-season date',
        custom: 'custom requirements',
        setup_complexity: 'setup complexity',
        discount: 'a discount applied',
        other: 'other (see explanation)',
      } as Record<string, string>
    )[reason] ?? 'other reason';

  return sendEmail({
    to: coupleEmail,
    subject: `${safeName} sent an adjusted quote`,
    html: `
      <h2>Adjusted quote from ${safeName}</h2>
      <p>New total: <strong>${fmtUsd(newTotalCents)}</strong></p>
      <p>Reason: ${reasonLabel}${explanation ? ` — &ldquo;${escapeHtml(explanation)}&rdquo;` : ''}</p>
      <p>Review and either accept the adjusted total or decline.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">Review quote</a></p>
      ${FOOTER}
    `,
  });
}

/**
 * Fired when a couple accepts the vendor's adjusted quote.
 * Recipient: vendor.
 */
export async function sendCoupleAcceptedAdjustedEmail(
  vendorEmail: string,
  coupleName: string,
  totalCents: number,
  bookingId: string
): Promise<boolean> {
  const safeName = escapeHtml(coupleName);
  return sendEmail({
    to: vendorEmail,
    subject: `${safeName} accepted your adjusted quote`,
    html: `
      <h2>Quote accepted</h2>
      <p>${safeName} accepted your adjusted quote of ${fmtUsd(totalCents)} and will pay the hold deposit shortly.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View booking</a></p>
      ${FOOTER}
    `,
  });
}

/**
 * Fired when a couple declines the vendor's adjusted quote.
 * Recipient: vendor.
 */
export async function sendCoupleDeclinedEmail(
  vendorEmail: string,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: 'Customer declined your adjusted quote',
    html: `
      <h2>Adjusted quote declined</h2>
      <p>The customer declined your adjusted quote. You have <strong>72 hours</strong> to send a revised quote, or the booking will auto-cancel.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">Send revised quote</a></p>
      ${FOOTER}
    `,
  });
}

// ─── Deposit Confirmation ─────────────────────────────────────────────────────

/**
 * Fired on deposit_paid for both vendor and couple.
 * Recipient: either (isVendor flag controls body).
 */
export async function sendDepositConfirmationEmail(
  email: string,
  vendorName: string,
  amount: number,
  isVendor: boolean
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  const body = isVendor
    ? `<p>A hold deposit of <strong>${fmtUsd(amount)}</strong> has been placed. The customer's contact details are now visible in your dashboard.</p>
       <p>The customer paid their 5% deposit. Coordinate the balance with them directly per your payment terms.</p>`
    : `<p>Your hold deposit of <strong>${fmtUsd(amount)}</strong> for ${safeName} has been processed. Your booking is confirmed.</p>`;

  return sendEmail({
    to: email,
    subject: `Deposit ${isVendor ? 'Received' : 'Confirmed'} — ${safeName}`,
    html: `
      <h2>Deposit ${isVendor ? 'Received' : 'Confirmed'}</h2>
      ${body}
      <p><a href="${appUrl()}/dashboard/bookings">View Booking</a></p>
      ${FOOTER}
    `,
  });
}

/**
 * Fired on deposit_paid — sent to the couple with vendor's full address revealed.
 * Recipient: couple.
 */
export async function sendBookingConfirmedEmail(
  coupleEmail: string,
  vendorName: string,
  vendorFullAddress: string,
  vendorNotes: string | null,
  bookingId: string
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  return sendEmail({
    to: coupleEmail,
    subject: `Booking Confirmed — ${safeName}`,
    html: `
      <h2>Booking confirmed</h2>
      <p>Your deposit has been processed. Here are the details:</p>
      <p><strong>Vendor location:</strong> ${escapeHtml(vendorFullAddress)}</p>
      ${vendorNotes ? `<p><strong>From your vendor:</strong> ${escapeHtml(vendorNotes)}</p>` : ''}
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View booking details</a></p>
      ${FOOTER}
    `,
  });
}

// ─── Auto-cancel ──────────────────────────────────────────────────────────────

/**
 * Fired when a booking is auto-cancelled by the 72h expiry sweep.
 * Recipient: couple or vendor (recipientRole is informational only).
 */
export async function sendBookingAutoCancelEmail(
  email: string,
  recipientRole: 'couple' | 'vendor',
  bookingId: string
): Promise<boolean> {
  // recipientRole is available for copy customisation in future; same body for now.
  void recipientRole;
  return sendEmail({
    to: email,
    subject: 'Booking auto-cancelled',
    html: `
      <h2>Booking auto-cancelled</h2>
      <p>This booking was automatically cancelled because no action was taken within 72 hours (e.g. deposit not paid or no response to a quote).</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View booking</a></p>
      ${FOOTER}
    `,
  });
}

// ─── Expiration (legacy) ──────────────────────────────────────────────────────

/**
 * Legacy expiration email for the old quoted flow.
 * New auto-cancel uses sendBookingAutoCancelEmail instead.
 */
export async function sendExpirationEmail(
  email: string,
  vendorName: string,
  isVendor: boolean
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  return sendEmail({
    to: email,
    subject: `Booking Request Expired — ${safeName}`,
    html: `
      <h2>Request Expired</h2>
      <p>${
        isVendor
          ? 'A booking request has expired because no quote was submitted within 72 hours.'
          : `Your booking request to ${safeName} has expired because the vendor did not respond within 72 hours.`
      }</p>
      <p><a href="${appUrl()}/dashboard/bookings">Go to Dashboard</a></p>
      ${FOOTER}
    `,
  });
}

// ─── Completion ───────────────────────────────────────────────────────────────

export async function sendCompletionEmailToVendor(
  vendorEmail: string,
  vendorName: string,
  vendorPayoutCents: number
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: `Booking complete — ${fmtUsd(vendorPayoutCents)} earned`,
    html: `
      <h2>Booking marked complete</h2>
      <p>Hi ${escapeHtml(vendorName)},</p>
      <p>A booking you delivered has been marked complete. You&rsquo;ve earned <strong>${fmtUsd(vendorPayoutCents)}</strong> on this booking via Baazar. Collect the remaining 95% balance directly from your customer per your payment terms.</p>
      <p><a href="${appUrl()}/dashboard">View your earnings</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendReviewRequestEmail(
  coupleEmail: string,
  vendorName: string,
  bookingId: string
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  return sendEmail({
    to: coupleEmail,
    subject: `How was ${safeName}?`,
    html: `
      <h2>Leave a review</h2>
      <p>Thanks for using Baazar.io! Your feedback helps other customers find great vendors.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">Leave a review for ${safeName}</a></p>
      ${FOOTER}
    `,
  });
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export async function sendCancellationEmail(
  email: string,
  vendorName: string,
  cancellerRole: 'couple' | 'vendor' | 'mutual',
  recipientRole: 'couple' | 'vendor',
  refundCents: number,
  reason: string | null
): Promise<boolean> {
  const safeName = escapeHtml(vendorName);
  const actor =
    cancellerRole === 'mutual'
      ? 'by mutual agreement'
      : cancellerRole === recipientRole
        ? 'by you'
        : `by the ${cancellerRole}`;

  const refundLine =
    refundCents > 0
      ? `<p>A refund of <strong>${fmtUsd(refundCents)}</strong> has been issued to the customer.</p>`
      : '<p>No refund was issued under our cancellation policy.</p>';

  return sendEmail({
    to: email,
    subject: `Booking Cancelled — ${safeName}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>This booking with ${safeName} was cancelled ${actor}.</p>
      ${reason ? `<p><em>Reason:</em> ${escapeHtml(reason)}</p>` : ''}
      ${refundLine}
      <p><a href="${appUrl()}/dashboard/bookings">View Bookings</a></p>
      ${FOOTER}
    `,
  });
}

// ─── K-2: Unclaimed listing ownership requests ────────────────────────────────

const OPS_INBOX = process.env.OPS_INBOX_EMAIL || 'hello@baazar.io';

/** Fired when a vendor clicks "I own this business" → "Get help claiming". */
export async function sendClaimRequestTeamEmail(
  businessName: string,
  requesterName: string | null,
  requesterEmail: string,
  requesterIg: string | null,
  scrapedVendorId: string
): Promise<boolean> {
  const safeName = escapeHtml(businessName);
  const safeRequester = escapeHtml(requesterName ?? '(no name)');
  const safeIg = escapeHtml(requesterIg ?? '(none)');
  return sendEmail({
    to: OPS_INBOX,
    subject: `[Claim request] ${businessName}`,
    html: `
      <h2>New claim request</h2>
      <p><strong>Business:</strong> ${safeName}</p>
      <p><strong>Requested by:</strong> ${safeRequester} &lt;${escapeHtml(requesterEmail)}&gt;</p>
      <p><strong>Instagram:</strong> ${safeIg}</p>
      <p><strong>scraped_vendor_id:</strong> <code>${escapeHtml(scrapedVendorId)}</code></p>
      <p>Action: verify the claim, then mint a token via
        <code>npm run scrape:mint-tokens -- --campaign claim-${escapeHtml(scrapedVendorId).slice(0, 8)} --filter "id = '${escapeHtml(scrapedVendorId)}'"</code>
        and DM the link to <strong>@${safeIg}</strong>.</p>
      ${FOOTER}
    `,
  });
}

/** Auto-reply to the vendor who submitted a claim request. */
export async function sendClaimRequestVendorEmail(
  requesterEmail: string,
  businessName: string
): Promise<boolean> {
  return sendEmail({
    to: requesterEmail,
    subject: 'We received your Baazar claim request',
    html: `
      <h2>Thanks for reaching out</h2>
      <p>We received your request to claim <strong>${escapeHtml(businessName)}</strong>.</p>
      <p>We verify all claims via Instagram DM. You'll receive a unique claim link
        from our team's Instagram account within 7 days. Click the link to take
        ownership of your listing.</p>
      <p>If you don't see the DM, check your Instagram message requests folder.</p>
      ${FOOTER}
    `,
  });
}

/** Fired when a vendor clicks "I own this business" → "Remove my listing". */
export async function sendRemovalRequestTeamEmail(
  businessName: string,
  requesterName: string | null,
  requesterEmail: string,
  reason: string | null,
  scrapedVendorId: string
): Promise<boolean> {
  const safeName = escapeHtml(businessName);
  const safeRequester = escapeHtml(requesterName ?? '(no name)');
  const safeReason = escapeHtml(reason ?? '(none)');
  return sendEmail({
    to: OPS_INBOX,
    subject: `[Removal request] ${businessName}`,
    html: `
      <h2>New removal request</h2>
      <p><strong>Business:</strong> ${safeName}</p>
      <p><strong>Requested by:</strong> ${safeRequester} &lt;${escapeHtml(requesterEmail)}&gt;</p>
      <p><strong>Reason:</strong> ${safeReason}</p>
      <p><strong>scraped_vendor_id:</strong> <code>${escapeHtml(scrapedVendorId)}</code></p>
      <p><em>The row was automatically marked disputed at submit time.</em></p>
      ${FOOTER}
    `,
  });
}

// ─── Vendor Welcome ───────────────────────────────────────────────────────────

/**
 * Fired when a vendor finishes the wizard and clicks Publish.
 * Recipient: vendor.
 */
export async function sendVendorWelcomeEmail(
  vendorEmail: string,
  businessName: string,
  profileSlug: string,
  userId: string
): Promise<boolean> {
  const unsubscribeToken = buildUnsubscribeToken(userId);
  const html = await render(
    <VendorWelcomeTemplate
      businessName={businessName}
      profileSlug={profileSlug}
      unsubscribeToken={unsubscribeToken}
    />
  );
  return sendEmail({
    to: vendorEmail,
    subject: 'Your Baazar profile is live',
    html,
  });
}

/**
 * Fired 48 hours after a vendor's profile is published with no bookings received.
 * Recipient: vendor.
 */
export async function sendVendor48hFollowupEmail(
  vendorEmail: string,
  businessName: string,
  userId: string
): Promise<boolean> {
  const unsubscribeToken = buildUnsubscribeToken(userId);
  const html = await render(
    <Vendor48hFollowupTemplate businessName={businessName} unsubscribeToken={unsubscribeToken} />
  );
  return sendEmail({
    to: vendorEmail,
    subject: 'Tips for getting your first Baazar booking',
    html,
  });
}

/**
 * Fired when a vendor receives their very first booking request.
 * Replaces sendBookingRequestEmail for that milestone moment.
 * Recipient: vendor.
 */
export async function sendVendorFirstBookingEmail(
  vendorEmail: string,
  customerFirstName: string,
  eventType: string,
  eventDate: string,
  totalCents: number,
  depositCents: number,
  packageName: string,
  responseSlaHours: number,
  bookingId: string,
  userId: string
): Promise<boolean> {
  const unsubscribeToken = buildUnsubscribeToken(userId);
  const html = await render(
    <VendorFirstBookingTemplate
      customerFirstName={customerFirstName}
      eventType={eventType}
      eventDate={eventDate}
      totalCents={totalCents}
      depositCents={depositCents}
      packageName={packageName}
      responseSlaHours={responseSlaHours}
      bookingId={bookingId}
      unsubscribeToken={unsubscribeToken}
    />
  );
  return sendEmail({
    to: vendorEmail,
    subject: 'Your first Baazar booking is here 🎉',
    html,
  });
}

/** Auto-reply to the vendor who requested removal. */
export async function sendRemovalConfirmationVendorEmail(
  requesterEmail: string,
  businessName: string
): Promise<boolean> {
  return sendEmail({
    to: requesterEmail,
    subject: `Your Baazar listing will be removed — ${businessName}`,
    html: `
      <h2>Listing taken offline</h2>
      <p>We've removed <strong>${escapeHtml(businessName)}</strong> from Baazar
        within the next 48 hours. The business will not be re-scraped or relisted.</p>
      <p>If anything else is needed, reply to this email.</p>
      ${FOOTER}
    `,
  });
}

// ─── sendWithRecord ───────────────────────────────────────────────────────────

/**
 * Thin Resend send wrapper that, when given an optional `notificationId`,
 * updates that notification row's `email_status` column to 'sent' or 'failed'
 * after the Resend call resolves.
 */
export async function sendWithRecord(args: {
  to: string;
  subject: string;
  html: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const resend = client();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: args.to,
    subject: args.subject,
    html: args.html,
  });

  const now = new Date().toISOString();
  const ok = !error;
  const update = ok
    ? { email_status: 'sent' as const, email_attempted_at: now }
    : {
        email_status: 'failed' as const,
        email_attempted_at: now,
        email_error: error?.message ?? 'unknown',
      };

  if (args.notificationId) {
    const sb = await createServiceRoleClient();
    await sb.from('notifications').update(update).eq('id', args.notificationId);
  }

  return ok ? { ok: true, id: data?.id } : { ok: false, error: error?.message ?? 'unknown' };
}

// ─── Customer Welcome ─────────────────────────────────────────────────────────

function buildUnsubscribeToken(userId: string): string {
  const secret =
    process.env.SUPABASE_JWT_SECRET ?? process.env.RESEND_API_KEY ?? 'fallback-do-not-use';
  return jwt.sign({ sub: userId, scope: 'email_unsubscribe' }, secret, { expiresIn: '365d' });
}

/**
 * Fired 48 hours after a couple completes onboarding with no bookings.
 * Recipient: couple.
 */
export async function sendCustomer48hFollowupEmail(
  coupleEmail: string,
  firstName: string,
  hasEvent: boolean,
  eventType: string | null,
  eventDate: string | null,
  daysUntilEvent: number | null,
  suggestedVendors: SuggestedVendor[],
  primaryCategory: string | null,
  userId: string
): Promise<boolean> {
  void firstName; // reserved for personalisation in future
  const unsubscribeToken = buildUnsubscribeToken(userId);
  const html = await render(
    <Customer48hFollowupTemplate
      hasEvent={hasEvent}
      eventType={eventType}
      eventDate={eventDate}
      daysUntilEvent={daysUntilEvent}
      suggestedVendors={suggestedVendors}
      primaryCategory={primaryCategory}
      unsubscribeToken={unsubscribeToken}
    />
  );
  const subject = hasEvent
    ? `${daysUntilEvent} days until your event — here are vendors to consider`
    : 'Looking for wedding inspiration?';
  return sendEmail({ to: coupleEmail, subject, html });
}

/**
 * Fired when a couple completes sign-up.
 * Recipient: couple.
 */
export async function sendCustomerWelcomeEmail(
  coupleEmail: string,
  firstName: string,
  userId: string
): Promise<boolean> {
  const unsubscribeToken = buildUnsubscribeToken(userId);
  const html = await render(
    <CustomerWelcomeTemplate firstName={firstName} unsubscribeToken={unsubscribeToken} />
  );
  return sendEmail({
    to: coupleEmail,
    subject: `Welcome to Baazar, ${firstName}`,
    html,
  });
}
