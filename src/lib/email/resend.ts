import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'Desi Wedding Marketplace <noreply@desiwedding.io>';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
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
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings">View Request</a></p>
      <p>— Desi Wedding Marketplace</p>
    `,
  });
}

export async function sendQuoteEmail(
  coupleEmail: string,
  vendorName: string,
  quoteAmount: number,
  _bookingId: string
): Promise<boolean> {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(quoteAmount / 100);

  return sendEmail({
    to: coupleEmail,
    subject: `Quote Received from ${vendorName}`,
    html: `
      <h2>Quote Received</h2>
      <p>${vendorName} has sent you a quote of <strong>${formattedAmount}</strong>.</p>
      <p>Log in to review the quote and secure your booking with a small hold deposit.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings">View Quote</a></p>
      <p>— Desi Wedding Marketplace</p>
    `,
  });
}

export async function sendDepositConfirmationEmail(
  email: string,
  vendorName: string,
  amount: number,
  isVendor: boolean
): Promise<boolean> {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100);

  const body = isVendor
    ? `<p>A hold deposit of <strong>${formattedAmount}</strong> has been placed. You can now see the couple's contact details in your dashboard.</p>
       <p>Please confirm the booking to proceed.</p>`
    : `<p>Your hold deposit of <strong>${formattedAmount}</strong> for ${vendorName} has been processed. The vendor will now confirm your booking.</p>`;

  return sendEmail({
    to: email,
    subject: `Deposit ${isVendor ? 'Received' : 'Confirmed'} — ${vendorName}`,
    html: `
      <h2>Deposit ${isVendor ? 'Received' : 'Confirmed'}</h2>
      ${body}
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings">View Booking</a></p>
      <p>— Desi Wedding Marketplace</p>
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
      <p>${isVendor ? 'A booking request has expired because no quote was submitted within 72 hours.' : `Your booking request to ${vendorName} has expired because the vendor did not respond within 72 hours.`}</p>
      <p>${!isVendor ? 'You can browse other vendors and submit a new request.' : ''}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings">Go to Dashboard</a></p>
      <p>— Desi Wedding Marketplace</p>
    `,
  });
}
