import { Resend } from 'resend';
import { logger } from '@/lib/logger';
import { renderBrandedEmail } from './render';

const FROM_EMAIL = 'Baazar.io <noreply@baazar.io>';

function escapeHtml(s: string | null | undefined): string {
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
    subject: 'New booking request',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">New booking request</h2>
        <p style="margin:0 0 16px;">Hi ${escapeHtml(vendorName)},</p>
        <p style="margin:0 0 16px;">You have a new booking request for one of your packages. Review it within 72 hours — accept at the package price or send an adjusted quote.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View request</a></p>
      `,
    }),
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
    subject: 'Booking request sent',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Your booking request is in</h2>
        <p style="margin:0 0 16px;">Your booking request has been sent to the vendor. They have 72 hours to respond — accept at the listed price or send an adjusted quote.</p>
        <p style="margin:0 0 16px;">You'll be emailed as soon as they respond.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View your booking</a></p>
      `,
    }),
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
    subject: `Quote received from ${safeName}`,
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Quote received</h2>
        <p style="margin:0 0 16px;">${safeName} has sent you a quote of <strong>${fmtUsd(quoteAmount)}</strong>.</p>
        <p style="margin:0 0 16px;">Log in to review the quote and secure your booking with a 10% hold deposit.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View quote</a></p>
      `,
    }),
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
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">${safeName} accepted your booking</h2>
        <p style="margin:0 0 16px;">Total: <strong>${fmtUsd(totalCents)}</strong></p>
        <p style="margin:0 0 16px;">Pay your hold deposit (10%) to confirm. The vendor's full address and instructions will appear in your dashboard once the deposit is processed.</p>
        <p style="margin:24px 0;"><a href="${depositCheckoutUrl}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Pay deposit</a></p>
      `,
    }),
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
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Adjusted quote from ${safeName}</h2>
        <p style="margin:0 0 16px;">New total: <strong>${fmtUsd(newTotalCents)}</strong></p>
        <p style="margin:0 0 16px;">Reason: ${reasonLabel}${explanation ? ` — &ldquo;${escapeHtml(explanation)}&rdquo;` : ''}</p>
        <p style="margin:0 0 16px;">Review and either accept the adjusted total or decline.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Review quote</a></p>
      `,
    }),
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
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Quote accepted</h2>
        <p style="margin:0 0 16px;">${safeName} accepted your adjusted quote of <strong>${fmtUsd(totalCents)}</strong> and will pay the hold deposit shortly.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View booking</a></p>
      `,
    }),
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
    subject: 'Couple declined your adjusted quote',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Adjusted quote declined</h2>
        <p style="margin:0 0 16px;">The couple declined your adjusted quote. You have <strong>72 hours</strong> to send a revised quote, or the booking will auto-cancel.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Send revised quote</a></p>
      `,
    }),
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
    ? `<p style="margin:0 0 16px;">A hold deposit of <strong>${fmtUsd(amount)}</strong> has been placed. The couple's contact details are now visible in your dashboard.</p>
       <p style="margin:0 0 16px;">Your 70% share is held in escrow and released when you mark the booking complete after the event.</p>`
    : `<p style="margin:0 0 16px;">Your hold deposit of <strong>${fmtUsd(amount)}</strong> for ${safeName} has been processed. Your booking is confirmed.</p>`;

  return sendEmail({
    to: email,
    subject: `Deposit ${isVendor ? 'received' : 'confirmed'} — ${safeName}`,
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Deposit ${isVendor ? 'received' : 'confirmed'}</h2>
        ${body}
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View booking</a></p>
      `,
    }),
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
    subject: `Booking confirmed — ${safeName}`,
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Booking confirmed</h2>
        <p style="margin:0 0 16px;">Your deposit has been processed. Here are the details:</p>
        <p style="margin:0 0 16px;"><strong>Vendor location:</strong> ${escapeHtml(vendorFullAddress)}</p>
        ${vendorNotes ? `<p style="margin:0 0 16px;"><strong>From your vendor:</strong> ${escapeHtml(vendorNotes)}</p>` : ''}
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View booking details</a></p>
      `,
    }),
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
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Booking auto-cancelled</h2>
        <p style="margin:0 0 16px;">This booking was automatically cancelled because no action was taken within 72 hours (e.g. deposit not paid or no response to a quote).</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View booking</a></p>
      `,
    }),
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
    subject: `Booking request expired — ${safeName}`,
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Request expired</h2>
        <p style="margin:0 0 16px;">${
          isVendor
            ? 'A booking request has expired because no quote was submitted within 72 hours.'
            : `Your booking request to ${safeName} has expired because the vendor did not respond within 72 hours.`
        }</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Go to dashboard</a></p>
      `,
    }),
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
    subject: `Funds unlocked — ${fmtUsd(vendorPayoutCents)} available`,
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Your deposit share is unlocked</h2>
        <p style="margin:0 0 16px;">Hi ${escapeHtml(vendorName)},</p>
        <p style="margin:0 0 16px;">A booking you delivered has been marked complete. <strong>${fmtUsd(vendorPayoutCents)}</strong> is now available to withdraw.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Go to earnings</a></p>
      `,
    }),
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
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Leave a review</h2>
        <p style="margin:0 0 16px;">Thanks for using Baazar! Your feedback helps other couples find great vendors.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Leave a review for ${safeName}</a></p>
      `,
    }),
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
      ? `<p style="margin:0 0 16px;">A refund of <strong>${fmtUsd(refundCents)}</strong> has been issued to the couple.</p>`
      : '<p style="margin:0 0 16px;">No refund was issued under our cancellation policy.</p>';

  return sendEmail({
    to: email,
    subject: `Booking cancelled — ${safeName}`,
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Booking cancelled</h2>
        <p style="margin:0 0 16px;">This booking with ${safeName} was cancelled ${actor}.</p>
        ${reason ? `<p style="margin:0 0 16px;font-style:italic;color:#5F5650;">Reason: ${escapeHtml(reason)}</p>` : ''}
        ${refundLine}
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View bookings</a></p>
      `,
    }),
  });
}

// ─── Custom Request ───────────────────────────────────────────────────────────

/**
 * Fired when a couple submits a custom-request booking (status='pending_quote').
 * Recipient: vendor.
 *
 * Includes a preview of the couple's description (truncated to ~140 chars)
 * so the vendor can scan the request in the inbox preview.
 */
export async function sendCustomRequestReceivedEmail(
  vendorEmail: string,
  ctx: {
    bookingId: string;
    coupleName: string;
    eventDate: string;
    eventType: string;
    guestCount: number;
    descriptionPreview: string;
  }
): Promise<boolean> {
  const safeCouple = escapeHtml(ctx.coupleName);
  const safeDate = escapeHtml(ctx.eventDate);
  const safeType = escapeHtml(ctx.eventType);
  const safeDesc = escapeHtml(ctx.descriptionPreview);

  return sendEmail({
    to: vendorEmail,
    subject: 'New custom request',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">New custom request</h2>
        <p style="margin:0 0 16px;">${safeCouple} sent you a custom request for <strong>${safeDate}</strong>.</p>
        <p style="margin:0 0 8px;"><strong>Event type:</strong> ${safeType}</p>
        <p style="margin:0 0 8px;"><strong>Guest count:</strong> ${ctx.guestCount}</p>
        <p style="margin:0 0 16px;color:#5F5650;font-style:italic;">"${safeDesc}"</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${ctx.bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Send a quote</a></p>
        <p style="margin:0;color:#5F5650;font-size:13px;">Send a quote to lock it in. Couples typically expect a response within 72 hours.</p>
      `,
    }),
  });
}

// ─── Newsletter Welcome ───────────────────────────────────────────────────────

/**
 * Fired when a user subscribes to "The Bazaar Letter" via the footer signup.
 * Recipient: the subscriber. Sent for both new and already-subscribed
 * addresses (the upstream API is idempotent, and re-sending a welcome
 * email is a low-cost graceful response).
 */
export async function sendNewsletterWelcomeEmail(email: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to The Bazaar Letter',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Welcome to The Bazaar Letter</h2>
        <p style="margin:0 0 16px;">Thanks for subscribing. We send <strong>monthly</strong> — newly verified vendors, real Chicago wedding photos, and the occasional honest note. No noise.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/vendors" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Browse vendors</a></p>
        <p style="margin:0;color:#5F5650;font-size:13px;">If this wasn't you, ignore this email — you won't hear from us again.</p>
      `,
    }),
  });
}
