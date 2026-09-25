import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DeleteEventButton } from '@/components/events/DeleteEventButton';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
});

describe('<DeleteEventButton>', () => {
  it('does not show the confirm dialog until the trigger is clicked', () => {
    render(<DeleteEventButton eventId="e-1" />);
    expect(screen.queryByRole('heading', { name: /Delete this event/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Delete event/i }));
    expect(screen.getByRole('heading', { name: /Delete this event/i })).toBeInTheDocument();
  });

  it('DELETEs the event then navigates to the events list on confirm', async () => {
    render(<DeleteEventButton eventId="e-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Delete event/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete event/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/events/e-1');
    expect((call[1] as RequestInit).method).toBe('DELETE');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/events'));
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the dialog open and shows an inline error on failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: null }),
      }) as unknown as typeof fetch;

    render(<DeleteEventButton eventId="e-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Delete event/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete event/i }));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
