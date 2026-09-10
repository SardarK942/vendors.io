// src/__tests__/components/forms/EventTypeAutocomplete.test.tsx
import { describe, it, expect, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventTypeAutocomplete } from '@/components/forms/EventTypeAutocomplete';

// Radix Popover + cmdk exercise pointer-capture and scrollIntoView, which jsdom
// does not implement. Polyfill them so user-event pointer interactions work.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function Harness() {
  const [value, setValue] = useState('');
  return <EventTypeAutocomplete value={value} onChange={setValue} />;
}

describe('EventTypeAutocomplete', () => {
  // NOTE: this drives selection by KEYBOARD. cmdk's pointer/click selection does
  // not fire in jsdom, so the mouse-specific reopen bug (input loses focus to the
  // popover on click, then handlePick's refocus retriggered onFocus → reopen) can't
  // be reproduced here — it's verified by the suppressReopenRef guard + manual QA.
  // This test still locks the commit-and-close contract against regressions.
  it('closes the dropdown after an option is selected', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText(/Mehndi/i);
    await user.click(input);
    await user.keyboard('Birthday party');

    await screen.findByRole('option', { name: 'Birthday party' });
    await user.keyboard('{ArrowDown}{Enter}');

    // Value is committed to the input…
    expect(input).toHaveValue('Birthday party');
    // …and the listbox is gone — selecting a choice must dismiss the dropdown.
    expect(screen.queryByRole('option', { name: 'Birthday party' })).not.toBeInTheDocument();
  });
});
