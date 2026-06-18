import { describe, it, expect } from 'vitest';
import type { Database } from '@/types/database.types';
import { NOTIFICATION_ACTIONS, getActionsFor } from '@/components/notifications/actions';

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

  it('booking_completed: vendor sees View booking, couple sees Leave Review', () => {
    const vendorRow = {
      id: 'n_1',
      type: 'booking_completed',
      metadata: { booking_id: 'b_1', recipient_role: 'vendor' },
    } as unknown as NotificationRow;
    const coupleRow = {
      ...vendorRow,
      metadata: { booking_id: 'b_1', recipient_role: 'couple' },
    } as unknown as NotificationRow;

    const vendorActions = getActionsFor(vendorRow);
    expect(vendorActions[0]).toMatchObject({ label: 'View booking', variant: 'secondary' });
    expect(vendorActions[0].href(vendorRow)).toBe('/dashboard/bookings/b_1');

    const coupleActions = getActionsFor(coupleRow);
    expect(coupleActions[0]).toMatchObject({ label: 'Leave Review', variant: 'primary' });
    expect(coupleActions[0].href(coupleRow)).toBe('/dashboard/bookings/b_1?action=leave-review');
  });
});
