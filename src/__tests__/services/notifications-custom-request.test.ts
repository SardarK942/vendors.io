import { describe, it, expect, vi } from 'vitest';
import { notifyCustomRequestReceived } from '@/services/notifications.service';

describe('notifyCustomRequestReceived', () => {
  it('inserts a notification with custom_request_received type + correct fields', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: { id: 'notif-1' }, error: null });
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: insertSpy,
          })),
        })),
      })),
    } as unknown as Parameters<typeof notifyCustomRequestReceived>[0];

    const result = await notifyCustomRequestReceived(supabase, 'vendor-user-1', {
      bookingId: 'booking-1',
      coupleName: 'Anya & Rohan',
      eventDate: '2026-10-17',
    });

    expect(result).toEqual({ id: 'notif-1' });
    expect(supabase.from).toHaveBeenCalledWith('notifications');
  });
});
