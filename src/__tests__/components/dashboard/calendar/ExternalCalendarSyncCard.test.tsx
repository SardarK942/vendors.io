import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExternalCalendarSyncCard } from '@/components/dashboard/calendar/ExternalCalendarSyncCard';

const baseStatus = {
  state: 'not_connected' as const,
  intent_method: null,
  connected_at: null,
  connected_via_ua: null,
  last_poll_at: null,
  polls_24h: 0,
  feed_url: null,
  has_first_booking: false,
};

describe('ExternalCalendarSyncCard', () => {
  it('shows the not-connected CTA when state is not_connected', () => {
    render(<ExternalCalendarSyncCard initialStatus={baseStatus} />);
    expect(screen.getByText(/Choose your calendar app/)).toBeTruthy();
    expect(screen.getByText(/See Baazar bookings in your calendar app/)).toBeTruthy();
  });

  it('shows the pending copy when state is pending', () => {
    render(
      <ExternalCalendarSyncCard
        initialStatus={{
          ...baseStatus,
          state: 'pending',
          intent_method: 'google',
          feed_url: 'https://baazar.io/api/cal/abc.ics',
        }}
      />
    );
    expect(screen.getByText(/Pending verification/i)).toBeTruthy();
  });

  it('shows the connected stats when state is connected', () => {
    render(
      <ExternalCalendarSyncCard
        initialStatus={{
          ...baseStatus,
          state: 'connected',
          connected_at: '2026-06-25T12:00:00Z',
          connected_via_ua: 'Google-Calendar-Importer',
          last_poll_at: '2026-06-25T14:00:00Z',
          polls_24h: 2,
          feed_url: 'https://baazar.io/api/cal/abc.ics',
        }}
      />
    );
    expect(screen.getByText(/Connected via Google/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeTruthy();
  });
});
