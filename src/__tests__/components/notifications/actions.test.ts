import { describe, it, expect } from 'vitest';
import type { Database } from '@/types/database.types';
import { NOTIFICATION_ACTIONS } from '@/components/notifications/actions';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

describe('NOTIFICATION_ACTIONS map', () => {
  it('booking_request_received has Accept primary + Adjust + Decline', () => {
    const actions = NOTIFICATION_ACTIONS.booking_request_received!;
    expect(actions[0]).toMatchObject({ label: 'Accept', variant: 'primary' });
    expect(actions.find((a) => a.label === 'Adjust')).toBeDefined();
    expect(actions.find((a) => a.label === 'Decline')?.variant).toBe('destructive');
  });

  it('vendor_adjusted_quote has Accept + Counter + Decline', () => {
    const actions = NOTIFICATION_ACTIONS.vendor_adjusted_quote!;
    expect(actions.map((a) => a.label)).toEqual(['Accept', 'Counter', 'Decline']);
  });

  it('href builder for booking_request_received returns /dashboard/bookings/b_1?action=accept', () => {
    const fakeRow = {
      id: 'n_1',
      type: 'booking_request_received',
      metadata: { booking_id: 'b_1' },
    } as unknown as NotificationRow;
    expect(NOTIFICATION_ACTIONS.booking_request_received![0].href(fakeRow)).toBe(
      '/dashboard/bookings/b_1?action=accept'
    );
  });
});
