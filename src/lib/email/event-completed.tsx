// src/lib/email/event-completed.tsx
import { sendWithRecord } from '@/lib/email/resend';

interface EventCompletedArgs {
  recipientRole: 'couple' | 'vendor';
  vendorName: string;
  coupleName: string;
  eventTypeLabel: string;
  sequence: number;
  eventsCount: number;
  bookingId: string;
}

export function renderEventCompletedHtml(args: EventCompletedArgs): string {
  const intro =
    args.recipientRole === 'couple'
      ? `Hope <strong>${args.eventTypeLabel}</strong> was a great day.`
      : `Baazar marked <strong>${args.eventTypeLabel}</strong> complete with ${args.coupleName}.`;
  const balanceLine =
    args.recipientRole === 'couple'
      ? `The remaining balance is owed directly to ${args.vendorName} per their payment terms — Baazar collected your deposit; the rest is between you two.`
      : `Collect the balance per your payment terms. Once all events for this booking finish, platform funds release and the couple receives a review request.`;
  const reviewLine =
    args.recipientRole === 'couple'
      ? `Once all your booked events finish, we'll ask you to leave a review.`
      : '';
  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">Event ${args.sequence} of ${args.eventsCount} marked complete</h1>
      <p>${intro}</p>
      <p>${balanceLine}</p>
      ${reviewLine ? `<p>${reviewLine}</p>` : ''}
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/dashboard/bookings/${args.bookingId}"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          View booking
        </a>
      </p>
    </div>
  `;
}

export async function sendEventCompletedEmail(args: {
  to: string;
  recipientRole: 'couple' | 'vendor';
  vendorName: string;
  coupleName: string;
  eventTypeLabel: string;
  sequence: number;
  eventsCount: number;
  bookingId: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subject =
    args.recipientRole === 'couple'
      ? `Event ${args.sequence} of ${args.eventsCount} marked complete with ${args.vendorName}`
      : `Event ${args.sequence} of ${args.eventsCount} marked complete with ${args.coupleName}`;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderEventCompletedHtml(args),
    notificationId: args.notificationId,
  });
}
