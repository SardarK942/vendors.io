import { Resend } from 'resend';

const FROM_EMAIL = 'Vendors.io <onboarding@resend.dev>';

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
      console.error('[sendEmail] Resend error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[sendEmail] Exception:', err);
    return false;
  }
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

const FOOTER = '<p style="color:#888;font-size:12px;">— Vendors.io</p>';

export async function sendBookingRequestEmail(
  vendorEmail: string,
  vendorName: string,
  eventType: string,
  eventDate: string,
  _bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: `New Booking Request — ${eventType}`,
    html: `
      <h2>New Booking Request</h2>
      <p>Hi ${vendorName},</p>
      <p>You have a new booking request for a <strong>${eventType}</strong> on <strong>${eventDate}</strong>.</p>
      <p>Please log in to your dashboard to review and submit a quote within 72 hours.</p>
      <p><a href="${appUrl()}/dashboard/bookings">View Request</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendQuoteEmail(
  coupleEmail: string,
  vendorName: string,
  quoteAmount: number,
  _bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: coupleEmail,
    subject: `Quote Received from ${vendorName}`,
    html: `
      <h2>Quote Received</h2>
      <p>${vendorName} has sent you a quote of <strong>${fmtUsd(quoteAmount)}</strong>.</p>
      <p>Log in to review the quote and secure your booking with a 10% hold deposit.</p>
      <p><a href="${appUrl()}/dashboard/bookings">View Quote</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendDepositConfirmationEmail(
  email: string,
  vendorName: string,
  amount: number,
  isVendor: boolean
): Promise<boolean> {
  const body = isVendor
    ? `<p>A hold deposit of <strong>${fmtUsd(amount)}</strong> has been placed. The couple's contact details are now visible in your dashboard.</p>
       <p>Your 70% share is held in escrow and released when you mark the booking complete after the event.</p>`
    : `<p>Your hold deposit of <strong>${fmtUsd(amount)}</strong> for ${vendorName} has been processed. Your booking is confirmed.</p>`;

  return sendEmail({
    to: email,
    subject: `Deposit ${isVendor ? 'Received' : 'Confirmed'} — ${vendorName}`,
    html: `
      <h2>Deposit ${isVendor ? 'Received' : 'Confirmed'}</h2>
      ${body}
      <p><a href="${appUrl()}/dashboard/bookings">View Booking</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendExpirationEmail(
  email: string,
  vendorName: string,
  isVendor: boolean
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Booking Request Expired — ${vendorName}`,
    html: `
      <h2>Request Expired</h2>
      <p>${
        isVendor
          ? 'A booking request has expired because no quote was submitted within 72 hours.'
          : `Your booking request to ${vendorName} has expired because the vendor did not respond within 72 hours.`
      }</p>
      <p><a href="${appUrl()}/dashboard/bookings">Go to Dashboard</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendCompletionEmailToVendor(
  vendorEmail: string,
  vendorName: string,
  vendorPayoutCents: number
): Promise<boolean> {
  return sendEmail({
    to: vendorEmail,
    subject: `Funds Unlocked — ${fmtUsd(vendorPayoutCents)} Available`,
    html: `
      <h2>Your deposit share is unlocked</h2>
      <p>Hi ${vendorName},</p>
      <p>A booking you delivered has been marked complete. <strong>${fmtUsd(vendorPayoutCents)}</strong> is now available to withdraw.</p>
      <p><a href="${appUrl()}/dashboard">Go to Earnings</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendReviewRequestEmail(
  coupleEmail: string,
  vendorName: string,
  bookingId: string
): Promise<boolean> {
  return sendEmail({
    to: coupleEmail,
    subject: `How was ${vendorName}?`,
    html: `
      <h2>Leave a review</h2>
      <p>Thanks for using Vendors.io! Your feedback helps other couples find great vendors.</p>
      <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">Leave a review for ${vendorName}</a></p>
      ${FOOTER}
    `,
  });
}

export async function sendCancellationEmail(
  email: string,
  vendorName: string,
  cancellerRole: 'couple' | 'vendor' | 'mutual',
  recipientRole: 'couple' | 'vendor',
  refundCents: number,
  reason: string | null
): Promise<boolean> {
  const actor =
    cancellerRole === 'mutual'
      ? 'by mutual agreement'
      : cancellerRole === recipientRole
        ? 'by you'
        : `by the ${cancellerRole}`;

  const refundLine =
    refundCents > 0
      ? `<p>A refund of <strong>${fmtUsd(refundCents)}</strong> has been issued to the couple.</p>`
      : '<p>No refund was issued under our cancellation policy.</p>';

  return sendEmail({
    to: email,
    subject: `Booking Cancelled — ${vendorName}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>This booking with ${vendorName} was cancelled ${actor}.</p>
      ${reason ? `<p><em>Reason:</em> ${reason}</p>` : ''}
      ${refundLine}
      <p><a href="${appUrl()}/dashboard/bookings">View Bookings</a></p>
      ${FOOTER}
    `,
  });
}
