import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const notifyEventTaskDueMock = vi.fn().mockResolvedValue({ id: 'notif-due' });
const notifyEventTaskOverdueMock = vi.fn().mockResolvedValue({ id: 'notif-overdue' });
const notifyEventCountdownMock = vi.fn().mockResolvedValue({ id: 'notif-countdown' });
vi.mock('@/services/notifications.service', () => ({
  notifyEventTaskDue: (...args: unknown[]) => notifyEventTaskDueMock(...args),
  notifyEventTaskOverdue: (...args: unknown[]) => notifyEventTaskOverdueMock(...args),
  notifyEventCountdown: (...args: unknown[]) => notifyEventCountdownMock(...args),
}));

vi.mock('@/lib/notifications/deliver', () => ({
  deliver: vi.fn((_kind: string, fn: () => unknown) => fn()),
}));

const sendEventTaskOverdueEmailMock = vi.fn().mockResolvedValue({ ok: true, id: 'email-overdue' });
vi.mock('@/lib/email/event-task-overdue', () => ({
  sendEventTaskOverdueEmail: (...args: unknown[]) => sendEventTaskOverdueEmailMock(...args),
}));

const sendEventCountdownEmailMock = vi.fn().mockResolvedValue({ ok: true, id: 'email-countdown' });
vi.mock('@/lib/email/event-countdown', () => ({
  sendEventCountdownEmail: (...args: unknown[]) => sendEventCountdownEmailMock(...args),
}));

// Generic chainable/thenable query-builder stand-in: any method call returns
// another instance of the same chain, and awaiting it resolves to `result`.
// This mirrors how supabase-js query builders are themselves thenables.
function chain(result: unknown): unknown {
  const target = { then: (resolve: (v: unknown) => void) => resolve(result) };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return (t as Record<string | symbol, unknown>)[prop];
      return () => chain(result);
    },
  });
}

interface TableData {
  events?: unknown;
  event_tasks?: unknown;
  event_functions?: unknown;
  event_vendor_needs?: unknown;
}

function buildSupabase(tables: TableData, coupleEmail: string | null = 'couple@test.com') {
  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: { email: coupleEmail } } }),
      },
    },
    from: vi.fn((table: keyof TableData) => chain({ data: tables[table] ?? [], error: null })),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/cron/event-reminders/route';

function makeRequest(bearer?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/event-reminders', {
    method: 'POST',
    headers: bearer !== undefined ? { authorization: `Bearer ${bearer}` } : {},
  });
}

const mockedCreateServiceRoleClient = vi.mocked(createServiceRoleClient);

describe('POST /api/cron/event-reminders', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('returns 401 when no authorization header is present', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockedCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is wrong', async () => {
    const res = await POST(makeRequest('nope'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest('test-secret'));
    expect(res.status).toBe(401);
  });

  it('returns ok with zero counts when there are no events', async () => {
    mockedCreateServiceRoleClient.mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buildSupabase({ events: [] }) as any
    );
    const res = await POST(makeRequest('test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, sent: { dueSoon: 0, overdue: 0, countdown: 0 } });
  });

  it('notifies due-soon tasks in-app only (no email wired for that class)', async () => {
    mockedCreateServiceRoleClient.mockReturnValue(
      buildSupabase({
        events: [{ id: 'e1', couple_user_id: 'u1', name: 'Aisha & Omar' }],
        event_tasks: [
          {
            id: 't1',
            event_id: 'e1',
            event_function_id: null,
            title: 'Book decor',
            due_date: '2026-07-20',
            completed_at: null,
            due_soon_notified_at: null,
            overdue_notified_at: null,
            sort: 0,
            created_at: '',
            updated_at: '',
          },
        ],
        event_functions: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    );
    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();
    expect(body.sent).toEqual({ dueSoon: 1, overdue: 0, countdown: 0 });
    expect(notifyEventTaskDueMock).toHaveBeenCalledTimes(1);
    expect(sendEventTaskOverdueEmailMock).not.toHaveBeenCalled();
    expect(sendEventCountdownEmailMock).not.toHaveBeenCalled();
  });

  it('notifies + emails overdue tasks when a couple email is resolvable', async () => {
    mockedCreateServiceRoleClient.mockReturnValue(
      buildSupabase({
        events: [{ id: 'e1', couple_user_id: 'u1', name: 'Aisha & Omar' }],
        event_tasks: [
          {
            id: 't1',
            event_id: 'e1',
            event_function_id: null,
            title: 'Confirm caterer',
            due_date: '2026-07-01',
            completed_at: null,
            due_soon_notified_at: null,
            overdue_notified_at: null,
            sort: 0,
            created_at: '',
            updated_at: '',
          },
        ],
        event_functions: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    );
    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();
    expect(body.sent).toEqual({ dueSoon: 0, overdue: 1, countdown: 0 });
    expect(notifyEventTaskOverdueMock).toHaveBeenCalledTimes(1);
    expect(sendEventTaskOverdueEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEventTaskOverdueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'couple@test.com', notificationId: 'notif-overdue' })
    );
  });

  it('skips overdue email when no couple email is resolvable', async () => {
    mockedCreateServiceRoleClient.mockReturnValue(
      buildSupabase(
        {
          events: [{ id: 'e1', couple_user_id: 'u1', name: 'Aisha & Omar' }],
          event_tasks: [
            {
              id: 't1',
              event_id: 'e1',
              event_function_id: null,
              title: 'Confirm caterer',
              due_date: '2026-07-01',
              completed_at: null,
              due_soon_notified_at: null,
              overdue_notified_at: null,
              sort: 0,
              created_at: '',
              updated_at: '',
            },
          ],
          event_functions: [],
        },
        null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any
    );
    const res = await POST(makeRequest('test-secret'));
    const body = await res.json();
    expect(body.sent).toEqual({ dueSoon: 0, overdue: 1, countdown: 0 });
    expect(notifyEventTaskOverdueMock).toHaveBeenCalledTimes(1);
    expect(sendEventTaskOverdueEmailMock).not.toHaveBeenCalled();
  });

  it('notifies + emails countdown milestones with the open-slot count from deriveNeedStatus', async () => {
    mockedCreateServiceRoleClient.mockReturnValue(
      buildSupabase({
        events: [{ id: 'e1', couple_user_id: 'u1', name: 'Aisha & Omar' }],
        event_tasks: [],
        event_functions: [
          {
            id: 'f1',
            event_id: 'e1',
            sequence: 1,
            label: 'Mehndi',
            event_type_id: 'mehndi',
            date: '2026-08-01', // 30 days out from a mocked "today" — see route's `new Date()`
            start_time: null,
            end_time: null,
            venue_name: null,
            city: null,
            guest_estimate: null,
            notes: null,
            created_at: '',
            updated_at: '',
          },
        ],
        event_vendor_needs: [
          {
            id: 'n1',
            event_function_id: 'f1',
            category: 'decor',
            booking_id: null,
            manual_vendor_name: null,
            manual_amount_cents: null,
            manual_booked: false,
            notes: null,
            sort: 0,
            created_at: '',
            updated_at: '',
            bookings: null,
          },
          {
            id: 'n2',
            event_function_id: 'f1',
            category: 'catering',
            booking_id: null,
            manual_vendor_name: 'Zara Catering',
            manual_amount_cents: 100000,
            manual_booked: true,
            notes: null,
            sort: 1,
            created_at: '',
            updated_at: '',
            bookings: null,
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T00:00:00Z'));
    try {
      const res = await POST(makeRequest('test-secret'));
      const body = await res.json();
      expect(body.sent).toEqual({ dueSoon: 0, overdue: 0, countdown: 1 });
      expect(notifyEventCountdownMock).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        expect.objectContaining({ functionLabel: 'Mehndi', daysOut: 30, openSlots: 1 })
      );
      expect(sendEventCountdownEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'couple@test.com', openSlots: 1 })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates one failing event so the rest of the run still completes', async () => {
    const events = [
      { id: 'bad', couple_user_id: 'u-bad', name: 'Broken Event' },
      { id: 'e1', couple_user_id: 'u1', name: 'Aisha & Omar' },
    ];
    const taskForE1 = {
      id: 't1',
      event_id: 'e1',
      event_function_id: null,
      title: 'Book decor',
      due_date: '2026-07-20',
      completed_at: null,
      due_soon_notified_at: null,
      overdue_notified_at: null,
      sort: 0,
      created_at: '',
      updated_at: '',
    };
    const sb = {
      auth: {
        admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: null } } }) },
      },
      from: vi.fn((table: string) => {
        if (table === 'events') return chain({ data: events, error: null });
        if (table === 'event_tasks') {
          return {
            select: () => ({
              eq: (_col: string, eventId: string) =>
                eventId === 'bad'
                  ? Promise.reject(new Error('boom'))
                  : Promise.resolve({ data: [taskForE1], error: null }),
            }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          };
        }
        // event_functions (and anything else): empty result is enough for this test.
        return chain({ data: [], error: null });
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedCreateServiceRoleClient.mockReturnValue(sb as any);

    const res = await POST(makeRequest('test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // The second (healthy) event still gets processed despite the first throwing.
    expect(body.sent.dueSoon).toBe(1);
  });
});
