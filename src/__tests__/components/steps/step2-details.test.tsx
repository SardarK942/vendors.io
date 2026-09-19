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

describe('Step2Details — category wishlist section', () => {
  it('renders optional category fields and reports changes', async () => {
    const user = userEvent.setup();
    const onRequestedDetailChange = vi.fn();
    render(
      <Step2Details
        isMultiDay={false}
        events={[mkEvent()]}
        onEventsChange={vi.fn()}
        eventCity=""
        venueName=""
        budgetRange={null}
        description=""
        onEventCityChange={vi.fn()}
        onVenueNameChange={vi.fn()}
        onBudgetRangeChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        requestedDetailFields={[
          { key: 'menu', label: 'Menu', type: 'text' },
          { key: 'staff_included', label: 'Staff included', type: 'bool' },
        ]}
        requestedDetails={{}}
        onRequestedDetailChange={onRequestedDetailChange}
        eventOptions={[]}
        eventFunctionId={null}
        onEventFunctionIdChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText(/what you're looking for/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Menu'), 'x');
    expect(onRequestedDetailChange).toHaveBeenCalledWith('menu', 'x');

    await user.click(screen.getByLabelText('Staff included'));
    expect(onRequestedDetailChange).toHaveBeenCalledWith('staff_included', 'yes');
  });

  it('hides the section when there are no category fields', () => {
    render(
      <Step2Details
        isMultiDay={false}
        events={[mkEvent()]}
        onEventsChange={vi.fn()}
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
    expect(screen.queryByText(/what you're looking for/i)).not.toBeInTheDocument();
  });
});
