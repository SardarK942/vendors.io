// src/lib/email/custom-request.tsx
import { sendWithRecord } from '@/lib/email/resend';

interface CustomRequestArgs {
  coupleFirstName: string;
  coupleCity: string;
  eventType: string;
  eventDate: string; // YYYY-MM-DD
  headcount: number;
  location: string;
  description: string; // truncated to 200 chars before render
  bookingId: string;
}

export function renderCustomRequestHtml(args: CustomRequestArgs): string {
  const truncated = args.description.slice(0, 200);
  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">New custom request</h1>
      <p><strong>${args.coupleFirstName}</strong> from <strong>${args.coupleCity}</strong> has sent you a custom request.</p>
      <table style="border-collapse:collapse; margin:16px 0; width:100%;">
        <tr>
          <td style="padding:6px 12px 6px 0; color:#666; white-space:nowrap;">Event type</td>
          <td style="padding:6px 0;"><strong>${args.eventType}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0; color:#666; white-space:nowrap;">Date</td>
          <td style="padding:6px 0;"><strong>${args.eventDate}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0; color:#666; white-space:nowrap;">Headcount</td>
          <td style="padding:6px 0;"><strong>${args.headcount}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0; color:#666; white-space:nowrap;">Location</td>
          <td style="padding:6px 0;"><strong>${args.location}</strong></td>
        </tr>
      </table>
      <p style="margin:0 0 8px;"><strong>Their message:</strong></p>
      <p style="background:#F0EAD8; border-left:3px solid #1B1414; padding:12px 16px; margin:0 0 16px; border-radius:0 4px 4px 0;">${truncated}</p>
      <p style="color:#555; font-size:14px;">Couples expect a quote within 48 hours. Send yours now to lock in the date.</p>
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/dashboard/bookings/${args.bookingId}"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          Send your quote
        </a>
      </p>
    </div>
  `;
}

export async function sendCustomRequestEmail(args: {
  to: string;
  coupleFirstName: string;
  coupleCity: string;
  eventType: string;
  eventDate: string;
  headcount: number;
  location: string;
  description: string;
  bookingId: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subject = `New custom request from ${args.coupleFirstName} — ${args.eventType} on ${args.eventDate}`;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderCustomRequestHtml(args),
    notificationId: args.notificationId,
  });
}
