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

/** Group rows into a Map keyed by the value returned from `key`. */
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const existing = map.get(k);
    if (existing) existing.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/**
 * Build a userId→email map from the Admin API in one paginated pass, replacing
 * per-event getUserById round-trips. Mirrors the map the `tick` cron builds.
 */
async function buildEmailMap(
  sb: ReturnType<typeof createServiceRoleClient>
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) map.set(u.id, u.email ?? null);
    if (data.users.length < 1000) break;
  }
  return map;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const sb = createServiceRoleClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sent = { dueSoon: 0, overdue: 0, countdown: 0 };

  // NOTE: `events` intentionally stays unbounded. Reminders are derived from the
  // dates on child rows (event_tasks.due_date / event_functions.date), not from
  // any column on `events` itself, so there is no date on the driver row we could
  // filter on without risking dropping an event that still owes a reminder.
  const { data: events } = await sb.from('events').select('id, couple_user_id, name');
  const eventList = events ?? [];
  if (eventList.length === 0) {
    return NextResponse.json({ ok: true, sent });
  }
  const eventIds = eventList.map((e) => e.id);

  // Batch: one query each for tasks + functions across ALL events, grouped in
  // memory by event_id (replaces the per-event round-trips).
  const [{ data: allTasks }, { data: allFns }] = await Promise.all([
    sb.from('event_tasks').select('*').in('event_id', eventIds),
    sb.from('event_functions').select('*').in('event_id', eventIds),
  ]);
  const tasksByEvent = groupBy(allTasks ?? [], (t) => t.event_id);
  const fnsByEvent = groupBy(allFns ?? [], (f) => f.event_id);

  // Batch: one Admin API pass → id→email map (mirrors the `tick` cron), replacing
  // the per-event getUserById. Email is only wired for overdue tasks + countdown
  // milestones (the higher-urgency classes); due-soon stays in-app only.
  const emailById = await buildEmailMap(sb);

  // Batch: fetch vendor-needs for every milestone function across all events in a
  // single .in() query, bucketed by event_function_id. Only milestone functions
  // are fetched — matching the exact set the original per-event code ever read.
  const milestoneFnIds: string[] = [];
  for (const event of eventList) {
    for (const { fn } of selectCountdownFunctions(fnsByEvent.get(event.id) ?? [], todayIso)) {
      milestoneFnIds.push(fn.id);
    }
  }
  const needsByFn = new Map<string, NeedWithBooking[]>();
  if (milestoneFnIds.length > 0) {
    const { data: needs } = await sb
      .from('event_vendor_needs')
      .select('*, bookings(id, status, total_price_cents)')
      .in('event_function_id', milestoneFnIds);
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
  }

  for (const event of eventList) {
    try {
      const tasks = tasksByEvent.get(event.id) ?? [];
      const fns = fnsByEvent.get(event.id) ?? [];

      const dueSoonTasks = selectDueSoonTasks(tasks, todayIso);
      const overdueTasks = selectOverdueTasks(tasks, todayIso);
      const milestones = selectCountdownFunctions(fns, todayIso);

      // Email recipient resolved from the prefetched map (same value the per-event
      // getUserById returned). Still only consumed by the overdue/milestone
      // branches below, so unused for due-soon-only events.
      const coupleEmail: string | null = emailById.get(event.couple_user_id) ?? null;

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
