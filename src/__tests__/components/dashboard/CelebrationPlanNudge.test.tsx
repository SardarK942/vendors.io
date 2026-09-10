import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CelebrationPlanNudge } from '@/components/dashboard/CelebrationPlanNudge';
import type { EventOption } from '@/components/events/EventFunctionSelect';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const EVENTS: EventOption[] = [
  {
    eventId: 'e-1',
    eventName: "Aisha & Ahmed's Wedding",
    functions: [
      { id: 'fn-mehndi', label: 'Mehndi', date: '2026-09-12' },
      { id: 'fn-walima', label: 'Walima', date: '2026-09-14' },
    ],
  },
];

describe('CelebrationPlanNudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with no events, links to the wizard carrying the booking to attach', () => {
    render(
      <CelebrationPlanNudge bookingId="bk-1" vendorName="Strings Ice Cream" eventOptions={[]} />
    );
    const cta = screen.getByRole('link', { name: /start your celebration plan/i });
    expect(cta).toHaveAttribute('href', '/events/new?attachBooking=bk-1');
  });

  it('exposes context via a tooltip trigger', () => {
    render(
      <CelebrationPlanNudge bookingId="bk-1" vendorName="Strings Ice Cream" eventOptions={[]} />
    );
    // The info affordance that reveals "what planning means" on hover/focus.
    expect(screen.getByRole('button', { name: /what.?s a celebration plan/i })).toBeInTheDocument();
  });

  it('with existing events, attaches to the chosen function via the API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CelebrationPlanNudge bookingId="bk-1" vendorName="Strings Ice Cream" eventOptions={EVENTS} />
    );

    await user.selectOptions(screen.getByRole('combobox'), 'fn-walima');
    await user.click(screen.getByRole('button', { name: /add to plan/i }));

    expect(fetchMock).toHaveBeenCalledWith('/api/bookings/bk-1/attach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_function_id: 'fn-walima' }),
    });

    vi.unstubAllGlobals();
  });
});
