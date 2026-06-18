import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyCustomRequestReceived } from '@/services/notifications.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import * as supabaseServer from '@/lib/supabase/server';

type MockSrClient = SupabaseClient<Database>;

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('notifyCustomRequestReceived', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a notification with custom_request_received type + correct fields', async () => {
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'notif-1' }, error: null }),
      })),
    }));
    const mockSrClient = {
      from: vi.fn(() => ({ insert: insertSpy })),
    };
    vi.spyOn(supabaseServer, 'createServiceRoleClient').mockReturnValue(
      mockSrClient as unknown as MockSrClient
    );

    const dummySb = {} as Parameters<typeof notifyCustomRequestReceived>[0];

    const result = await notifyCustomRequestReceived(dummySb, 'vendor-user-1', {
      bookingId: 'booking-1',
      coupleName: 'Anya & Rohan',
      eventDate: '2026-10-17',
    });

    expect(result).toEqual({ id: 'notif-1' });
    expect(mockSrClient.from).toHaveBeenCalledWith('notifications');
    const insertArg = (insertSpy.mock.calls[0] as unknown[])[0] as unknown as {
      type: string;
      user_id: string;
      body: string;
      link: string;
    };
    expect(insertArg.type).toBe('custom_request_received');
    expect(insertArg.user_id).toBe('vendor-user-1');
    expect(insertArg.body).toContain('Anya & Rohan');
    expect(insertArg.body).toContain('2026-10-17');
    expect(insertArg.link).toBe('/dashboard/bookings/booking-1');
  });
});
