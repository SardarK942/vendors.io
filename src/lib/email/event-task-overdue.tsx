// src/lib/email/event-task-overdue.tsx
import { sendWithRecord, escapeHtml } from '@/lib/email/resend';

interface EventTaskOverdueArgs {
  eventName: string;
  taskTitle: string;
  dueDate: string; // YYYY-MM-DD
  eventId: string;
}

export function renderEventTaskOverdueHtml(args: EventTaskOverdueArgs): string {
  const safeEventName = escapeHtml(args.eventName);
  const safeTaskTitle = escapeHtml(args.taskTitle);
  const safeDueDate = escapeHtml(args.dueDate);
  const safeEventId = escapeHtml(args.eventId);

  return `
    <div style="font-family: -apple-system, sans-serif; background:#FBF6EC; color:#1B1414; padding:24px;">
      <h1 style="font-size:22px; margin:0 0 16px;">Task overdue for ${safeEventName}</h1>
      <p>"<strong>${safeTaskTitle}</strong>" was due ${safeDueDate}.</p>
      <p>Take a look and check it off, or update the due date, when you get a chance.</p>
      <p style="margin-top:24px;">
        <a href="https://www.baazar.io/dashboard/events/${safeEventId}"
           style="background:#1B1414; color:#FBF6EC; padding:12px 20px; text-decoration:none; border-radius:6px;">
          View task
        </a>
      </p>
    </div>
  `;
}

export async function sendEventTaskOverdueEmail(args: {
  to: string;
  eventName: string;
  taskTitle: string;
  dueDate: string;
  eventId: string;
  notificationId?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const subject = `Overdue: "${args.taskTitle}" for ${args.eventName}`;
  return sendWithRecord({
    to: args.to,
    subject,
    html: renderEventTaskOverdueHtml(args),
    notificationId: args.notificationId,
  });
}
