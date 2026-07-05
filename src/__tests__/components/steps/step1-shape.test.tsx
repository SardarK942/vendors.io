import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step1Shape } from '@/components/booking/steps/Step1Shape';

describe('Step1Shape', () => {
  it('renders single-event by default, no day counter visible', () => {
    render(<Step1Shape isMultiDay={false} dayCount={3} onChange={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /single event/i })).toBeChecked();
    expect(screen.queryByLabelText(/how many events/i)).not.toBeInTheDocument();
  });

  it('emits multi-day change and shows the day counter when picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Step1Shape isMultiDay={false} dayCount={3} onChange={onChange} onContinue={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /multi-day/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isMultiDay: true }));
  });

  it('shows day counter when isMultiDay=true', () => {
    render(<Step1Shape isMultiDay={true} dayCount={3} onChange={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByLabelText(/how many events/i)).toHaveValue(3);
  });

  it('fires onContinue when the button is clicked', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <Step1Shape isMultiDay={false} dayCount={3} onChange={vi.fn()} onContinue={onContinue} />
    );
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
