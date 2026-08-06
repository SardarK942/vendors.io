import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DatePicker } from '@/components/ui/date-picker';

function noop() {}

describe('DatePicker selected-day contrast', () => {
  it('applies hot-pink background and cream text to the button element of the selected day', () => {
    // Select TODAY: DayPicker defaults to the current month, so today's cell is
    // always rendered, and today is never disabled (the picker only disables
    // dates strictly before today). This keeps the test deterministic across any
    // run date — a hardcoded date rots when the calendar month rolls over.
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const { container } = render(<DatePicker selected={iso} onSelect={noop} />);
    // Find the cell and button for the selected date
    const selectedCell = container.querySelector(`[data-day="${iso}"]`);
    expect(selectedCell).not.toBeNull();
    const selectedBtn = selectedCell!.querySelector('button');
    expect(selectedBtn).not.toBeNull();

    const cellClasses = selectedCell!.className;
    const btnClasses = selectedBtn!.className;

    // The fix applies [&_button]:* variants to the cell,
    // which generates CSS rules that style the button descendant.
    // Verify the parent cell has the required styling variants.
    expect(cellClasses).toContain('[&_button]:bg-hot-pink');
    expect(cellClasses).toContain('[&_button]:text-cream');

    // Verify the old broken style (bg-ink) is NOT on the parent anymore
    expect(cellClasses).not.toContain('bg-ink');

    // Verify button does not have direct conflicting text-ink class in the wrong context
    // (it still has text-ink from day_button but will be overridden by parent's [&_button]:text-cream via CSS)
    expect(btnClasses).not.toMatch(/bg-ink/);
  });
});
