/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  getOrCreateFeedToken,
  rotateFeedToken,
  buildIcsForVendor,
  recordPoll,
  getFeedStatus,
} from '@/services/calendar-feed.service';

function mockSupabase(initialToken: string | null) {
  let token: string | null = initialToken;
  let state = initialToken ? 'pending' : 'not_connected';
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { calendar_feed_token: token, calendar_feed_state: state },
              error: null,
            })
          ),
        })),
      })),
      update: vi.fn((patch: any) => ({
        eq: vi.fn(() => {
          if ('calendar_feed_token' in patch) token = patch.calendar_feed_token;
          if ('calendar_feed_state' in patch) state = patch.calendar_feed_state;
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    })),
    _peek: () => ({ token, state }),
  } as any;
}

describe('getOrCreateFeedToken', () => {
  it('returns the existing token if already set', async () => {
    const sb = mockSupabase('existing-token-abc');
    const result = await getOrCreateFeedToken(sb, 'vendor-1');
    expect(result).toBe('existing-token-abc');
  });

  it('generates a fresh 22-char base64 token if absent', async () => {
    const sb = mockSupabase(null);
    const result = await getOrCreateFeedToken(sb, 'vendor-1');
    expect(result).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sb._peek().token).toBe(result);
  });
});

describe('rotateFeedToken', () => {
  it('overwrites the token and resets state to not_connected', async () => {
    const sb = mockSupabase('old-token');
    const fresh = await rotateFeedToken(sb, 'vendor-1');
    expect(fresh).not.toBe('old-token');
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sb._peek().state).toBe('not_connected');
  });
});

function mockSupabaseWithEvents(
  events: any[],
  profile: any = { timezone: 'America/Chicago', business_name: 'Test Vendor' }
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'vendor_profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: profile, error: null })),
            })),
          })),
        };
      }
      if (table === 'booking_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                gte: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: events, error: null })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  } as any;
}

describe('buildIcsForVendor', () => {
  it('emits a valid empty VCALENDAR when there are no bookings', async () => {
    const sb = mockSupabaseWithEvents([]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR\s*$/);
    expect(ics).not.toMatch(/BEGIN:VEVENT/);
  });

  it('emits one VEVENT per booking_event', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-1',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        event_type: 'sangeet',
        venue_name: 'Hyatt',
        venue_address: '123 Main St',
        booking_id: 'b-1',
        status: 'deposit_paid',
        couple_name: 'Anjali Sharma',
        couple_phone: '+13125550142',
        package_name: 'Bridal Plus',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toMatch(/UID:booking-event-be-1@baazar\.io/);
    expect(ics).toMatch(/SUMMARY:\[Baazar\] Bridal Plus — Sharma/);
    expect(ics).toMatch(/STATUS:CONFIRMED/); // deposit_paid → CONFIRMED
  });

  it('marks accepted-but-unpaid as TENTATIVE', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-2',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        status: 'accepted',
        booking_id: 'b-2',
        couple_name: 'Khan',
        package_name: 'Family',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toMatch(/STATUS:TENTATIVE/);
  });

  it('escapes commas and backslashes in LOCATION and DESCRIPTION', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-3',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        status: 'deposit_paid',
        booking_id: 'b-3',
        venue_address: '123 Main St, Suite #4, Chicago, IL',
        couple_name: 'Patel\\Test',
        package_name: 'Bridal',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).toContain('123 Main St\\, Suite #4\\, Chicago\\, IL');
    expect(ics).toContain('Patel\\\\Test');
  });

  it('never includes service-role-shaped strings', async () => {
    const sb = mockSupabaseWithEvents([
      {
        id: 'be-4',
        event_start_time: '2026-08-15T16:00:00Z',
        event_end_time: '2026-08-15T20:00:00Z',
        status: 'deposit_paid',
        booking_id: 'b-4',
        couple_name: 'X',
        package_name: 'P',
      },
    ]);
    const ics = await buildIcsForVendor(sb, 'vendor-1');
    expect(ics).not.toMatch(/service_role/);
    expect(ics).not.toMatch(/sk_live_/);
    expect(ics).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
  });
});

describe('recordPoll', () => {
  it('inserts a row + flips pending→connected on first recognized poll', async () => {
    let inserted: any = null;
    let updated: any = null;
    const sb: any = {
      from: vi.fn((table: string) => {
        if (table === 'vendor_calendar_feed_polls') {
          return {
            insert: vi.fn((row: any) => {
              inserted = row;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'vendor_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: { calendar_feed_state: 'pending' }, error: null })
                ),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => {
                  updated = patch;
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };

    await recordPoll({
      supabase: sb,
      vendorProfileId: 'vendor-1',
      userAgent: 'Google-Calendar-Importer',
      ipHash: 'abc',
      statusReturned: 200,
    });

    expect(inserted.recognized_provider).toBe('google');
    expect(inserted.user_agent).toBe('Google-Calendar-Importer');
    expect(updated.calendar_feed_state).toBe('connected');
    expect(updated.calendar_feed_connected_via_ua).toBe('Google-Calendar-Importer');
  });

  it('does NOT flip state when vendor is already connected', async () => {
    let updated: any = null;
    const sb: any = {
      from: vi.fn((table: string) => {
        if (table === 'vendor_calendar_feed_polls') {
          return { insert: vi.fn(() => Promise.resolve({ error: null })) };
        }
        if (table === 'vendor_profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({ data: { calendar_feed_state: 'connected' }, error: null })
                ),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => {
                  updated = patch;
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        return {};
      }),
    };
    await recordPoll({
      supabase: sb,
      vendorProfileId: 'v',
      userAgent: 'iCal/x',
      ipHash: 'h',
      statusReturned: 200,
    });
    expect(updated).toBeNull();
  });
});
