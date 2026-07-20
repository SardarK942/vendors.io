import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  selectDueSoonTasks,
  selectOverdueTasks,
  selectCountdownFunctions,
  deriveNeedStatus,
} from '@/lib/events/derive';
import type { NeedWithBooking } from '@/lib/events/derive';
import {
  notifyEventTaskDue,
  notifyEventTaskOverdue,
  notifyEventCountdown,
} from '@/services/notifications.service';
import { deliver } from '@/lib/notifications/deliver';
import { sendEventTaskOverdueEmail } from '@/lib/email/event-task-overdue';
import { sendEventCountdownEmail } from '@/lib/email/event-countdown';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sb = createServiceRoleClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sent = { dueSoon: 0, overdue: 0, countdown: 0 };

  const { data: events } = await sb.from('events').select('id, couple_user_id, name');
  for (const event of events ?? []) {
    try {
      const [{ data: tasks }, { data: fns }] = await Promise.all([
        sb.from('event_tasks').select('*').eq('event_id', event.id),
        sb.from('event_functions').select('*').eq('event_id', event.id),
      ]);

      const dueSoonTasks = selectDueSoonTasks(tasks ?? [], todayIso);
      const overdueTasks = selectOverdueTasks(tasks ?? [], todayIso);
      const milestones = selectCountdownFunctions(fns ?? [], todayIso);

      // Email is only wired for overdue tasks + countdown milestones (the higher-urgency
      // classes) — due-soon reminders stay in-app only per the classification decision.
      // Only pay for the auth lookup when we'll actually need an email recipient.
      let coupleEmail: string | null = null;
      if (overdueTasks.length > 0 || milestones.length > 0) {
        const { data: authUser } = await sb.auth.admin.getUserById(event.couple_user_id);
        coupleEmail = authUser.user?.email ?? null;
      }

      for (const t of dueSoonTasks) {
        // Isolated per-task: one bad due-soon notify must not abort the rest
        // of this event's due-soon/overdue/countdown reminders.
        try {
          await notifyEventTaskDue(sb, event.couple_user_id, {
            eventId: event.id,
            taskTitle: t.title,
            dueDate: t.due_date!,
          });
          await sb
            .from('event_tasks')
            .update({ due_soon_notified_at: new Date().toISOString() })
            .eq('id', t.id);
          sent.dueSoon++;
        } catch (err) {
          logger.error('event-reminders: due-soon task failed', err, {
            eventId: event.id,
            taskId: t.id,
          });
        }
      }

      for (const t of overdueTasks) {
        const notif = await deliver(
          'notify',
          () =>
            notifyEventTaskOverdue(sb, event.couple_user_id, {
              eventId: event.id,
              taskTitle: t.title,
              dueDate: t.due_date!,
            }),
          { event_id: event.id, task_id: t.id }
        );
        if (coupleEmail && notif?.id) {
          await deliver(
            'email',
            () =>
              sendEventTaskOverdueEmail({
                to: coupleEmail!,
                eventName: event.name,
                taskTitle: t.title,
                dueDate: t.due_date!,
                eventId: event.id,
                notificationId: notif.id,
              }),
            { event_id: event.id, task_id: t.id }
          );
        }
        await sb
          .from('event_tasks')
          .update({ overdue_notified_at: new Date().toISOString() })
          .eq('id', t.id);
        sent.overdue++;
      }

      if (milestones.length > 0) {
        const fnIds = (fns ?? []).map((f) => f.id);
        const { data: needs } = await sb
          .from('event_vendor_needs')
          .select('*, bookings(id, status, total_price_cents)')
          .in('event_function_id', fnIds);
        const needsByFn = new Map<string, NeedWithBooking[]>();
        for (const raw of needs ?? []) {
          const { bookings: b, ...need } = raw as typeof raw & {
            bookings: { id: string; status: string; total_price_cents: number | null } | null;
          };
          const n = { ...need, booking: b } as NeedWithBooking;
          const existing = needsByFn.get(n.event_function_id);
          if (existing) {
            existing.push(n);
          } else {
            needsByFn.set(n.event_function_id, [n]);
          }
        }
        for (const { fn, daysOut } of milestones) {
          const openSlots = (needsByFn.get(fn.id) ?? []).filter(
            (n) => deriveNeedStatus(n) === 'needed'
          ).length;
          const notif = await deliver(
            'notify',
            () =>
              notifyEventCountdown(sb, event.couple_user_id, {
                eventId: event.id,
                functionLabel: fn.label,
                daysOut,
                openSlots,
              }),
            { event_id: event.id, function_id: fn.id }
          );
          if (coupleEmail && notif?.id) {
            await deliver(
              'email',
              () =>
                sendEventCountdownEmail({
                  to: coupleEmail!,
                  eventName: event.name,
                  functionLabel: fn.label,
                  daysOut,
                  openSlots,
                  eventId: event.id,
                  notificationId: notif.id,
                }),
              { event_id: event.id, function_id: fn.id }
            );
          }
          sent.countdown++;
        }
      }
    } catch (err) {
      logger.error('event-reminders: event failed', err, { eventId: event.id });
    }
  }
  return NextResponse.json({ ok: true, sent });
}
