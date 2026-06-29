// src/__tests__/components/dashboard/calendar/ConnectCalendarModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectCalendarModal } from '@/components/dashboard/calendar/ConnectCalendarModal';

describe('ConnectCalendarModal', () => {
  it('does not render when closed', () => {
    render(
      <ConnectCalendarModal
        open={false}
        onClose={() => {}}
        feedUrl="https://baazar.io/api/cal/x.ics"
        onIntent={() => {}}
      />
    );
    expect(screen.queryByText(/Choose your calendar app/)).toBeNull();
  });

  it('renders all three provider rows when open', () => {
    render(
      <ConnectCalendarModal
        open={true}
        onClose={() => {}}
        feedUrl="https://baazar.io/api/cal/x.ics"
        onIntent={() => {}}
      />
    );
    expect(screen.getByRole('link', { name: /Google Calendar/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Apple Calendar/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Outlook/i })).toBeTruthy();
  });

  it('fires onIntent("google") when Google row clicked', () => {
    const onIntent = vi.fn();
    render(
      <ConnectCalendarModal
        open={true}
        onClose={() => {}}
        feedUrl="https://baazar.io/api/cal/x.ics"
        onIntent={onIntent}
      />
    );
    fireEvent.click(screen.getByRole('link', { name: /Google Calendar/i }));
    expect(onIntent).toHaveBeenCalledWith('google');
  });
});
