/**
 * TimeInput — branded 15-minute Popover listbox (replaces the native
 * <input type="time">, whose `step` Chrome ignored on the dropdown wheel).
 *
 * These jsdom/RTL tests stand in for the e2e proof when a browser can't run
 * here: they open the picker and select a slot, asserting onChange fires with
 * the right 24h HH:mm — the exact interaction the e2e spec now performs.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeInput } from '@/components/ui/TimeInput';

// Radix Popover uses scrollIntoView / ResizeObserver, which jsdom lacks.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error minimal stub for jsdom
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('TimeInput', () => {
  it('renders the selected value as a 12h label in the trigger', () => {
    render(<TimeInput value="16:00" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('4:00 PM');
  });

  it('shows the placeholder when there is no value', () => {
    render(<TimeInput value="" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Select a time');
  });

  it('forwards id, so a <label htmlFor> associates with the trigger', () => {
    render(
      <>
        <label htmlFor="start">Start Time</label>
        <TimeInput id="start" value="" onChange={() => {}} />
      </>
    );
    // getByLabelText resolves the label -> trigger button association.
    expect(screen.getByLabelText('Start Time')).toBe(screen.getByRole('combobox'));
  });

  it('opens the listbox and fires onChange with 24h HH:mm when a slot is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    // 96 slots rendered.
    expect(screen.getAllByRole('option')).toHaveLength(96);

    await user.click(screen.getByRole('option', { name: '4:00 PM' }));
    expect(onChange).toHaveBeenCalledWith('16:00');
  });

  it('marks the matching slot aria-selected when a value is set', async () => {
    const user = userEvent.setup();
    render(<TimeInput value="09:30" onChange={() => {}} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: '9:30 AM' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
