// src/lib/email/event-countdown.tsx
import { sendWithRecord, escapeHtml } from '@/lib/email/resend';

interface EventCountdownArgs {
  eventName: string;
  functionLabel: string;
  daysOut: number;
  openSlots: number;
  eventId: string;
}

export function renderEventCountdownHtml(args: EventCountdownArgs): string {
  const safeEventName = escapeHtml(args.eventName);
  const safeFunctionLabel = escapeHtml(args.functionLabel);
  const safeDaysOut = escapeHtml(String(args.daysOut));
  const safeEventId = escapeHtml(args.eventId);
  const dayWord = args.daysOut === 1 ? 'day' : 'days';
  const slotLine =
    args.openSlots > 0
      ? `<p>${escapeHtml(String(args.openSlots))} vendor slot${args.openSlots === 1 ? ' is' : 's are'} still open.</p>`
      : '';

  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">${safeFunctionLabel} is ${safeDaysOut} ${dayWord} away</h1>
      <p>Your <strong>${safeFunctionLabel}</strong> for <strong>${safeEventName}</strong> is coming up.</p>
      ${slotLine}
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/dashboard/events/${safeEventId}"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          View event
        </a>
      </p>
    </div>
  `;
}

export async function sendEventCountdownEmail(args: {
  to: string;
  eventName: string;
  functionLabel: string;
  daysOut: number;
  openSlots: number;
  eventId: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subject = `${args.functionLabel} is ${args.daysOut} day${args.daysOut === 1 ? '' : 's'} away`;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderEventCountdownHtml(args),
    notificationId: args.notificationId,
  });
}
