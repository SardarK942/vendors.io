// src/lib/email/couple-countered.tsx
import { sendWithRecord, escapeHtml } from '@/lib/email/resend';

interface CoupleCounteredArgs {
  coupleName: string;
  proposedTotalCents: number;
  note?: string; // pre-truncated to 200 chars before render
  vendorAdjustmentsRemaining: 0 | 1 | 2;
  bookingId: string;
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function renderCoupleCounteredHtml(args: CoupleCounteredArgs): string {
  const truncatedNote = args.note ? args.note.slice(0, 200) : undefined;

  const safeCoupleName = escapeHtml(args.coupleName);
  const safeProposedTotal = escapeHtml(fmtUsd(args.proposedTotalCents));
  const safeBookingId = escapeHtml(args.bookingId);

  const adjustWord = args.vendorAdjustmentsRemaining === 1 ? 'adjustment' : 'adjustments';
  const safeAdjustmentsLine = escapeHtml(
    `You have ${args.vendorAdjustmentsRemaining} ${adjustWord} remaining to respond.`
  );

  const noteBlock = truncatedNote
    ? `<blockquote style="background:#F0EAD8; border-left:3px solid #1B1414; padding:12px 16px; margin:16px 0; border-radius:0 4px 4px 0;">${escapeHtml(truncatedNote)}</blockquote>`
    : '';

  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">Counter-offer received</h1>
      <p><strong>${safeCoupleName}</strong> sent a counter-offer on your quote.</p>
      <table style="border-collapse:collapse; margin:16px 0; width:100%;">
        <tr>
          <td style="padding:6px 12px 6px 0; color:#666; white-space:nowrap;">Proposed total</td>
          <td style="padding:6px 0;"><strong>${safeProposedTotal}</strong></td>
        </tr>
      </table>
      ${noteBlock}
      <p style="color:#555; font-size:14px;">${safeAdjustmentsLine}</p>
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/dashboard/bookings/${safeBookingId}?action=respond-to-counter"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          View counter-offer
        </a>
      </p>
    </div>
  `;
}

export async function sendCoupleCounteredEmail(args: {
  to: string;
  coupleName: string;
  proposedTotalCents: number;
  note?: string;
  vendorAdjustmentsRemaining: 0 | 1 | 2;
  bookingId: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subject = `${args.coupleName} sent a counter-offer on your quote`;
  const truncatedNote = args.note ? args.note.slice(0, 200) : undefined;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderCoupleCounteredHtml({
      coupleName: args.coupleName,
      proposedTotalCents: args.proposedTotalCents,
      note: truncatedNote,
      vendorAdjustmentsRemaining: args.vendorAdjustmentsRemaining,
      bookingId: args.bookingId,
    }),
    notificationId: args.notificationId,
  });
}
