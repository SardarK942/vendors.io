import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step2Details } from '@/components/booking/steps/Step2Details';
import type { CustomEvent } from '@/components/booking/CustomRequestFlow';

function mkEvent(overrides: Partial<CustomEvent> = {}): CustomEvent {
  return {
    id: crypto.randomUUID(),
    date: '',
    startTime: '',
    guestCount: '50',
    eventTypeId: 'wedding',
    ...overrides,
  };
}

describe('Step2Details — guest count fix', () => {
  it('allows clearing the guest count field and typing a value not starting with 1', async () => {
    const user = userEvent.setup();
    let events: CustomEvent[] = [mkEvent()];
    const onEventsChange = vi.fn((next: CustomEvent[]) => {
      events = next;
    });
    render(
      <Step2Details
        isMultiDay={false}
        events={events}
        onEventsChange={onEventsChange}
        eventCity=""
        venueName=""
        budgetRange={null}
        description=""
        onEventCityChange={vi.fn()}
        onVenueNameChange={vi.fn()}
        onBudgetRangeChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        eventOptions={[]}
        eventFunctionId={null}
        onEventFunctionIdChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    const guestInput = screen.getByLabelText(/guests/i) as HTMLInputElement;
    await user.clear(guestInput);
    await user.type(guestInput, '600');
    // Final call to onEventsChange should carry guestCount '600' (string), not clamp to '1'.
    const last = onEventsChange.mock.calls.at(-1)?.[0][0].guestCount;
    expect(last).toBe('600');
  });
});
