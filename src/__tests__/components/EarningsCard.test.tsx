import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EarningsCard } from '@/app/dashboard/profile/payments/EarningsCard';

const base = {
  heldCents: 0,
  heldCount: 0,
  transferredCents: 0,
  lastTransferredAt: null,
  payoutsEnabled: false,
};

describe('EarningsCard', () => {
  it('held, not ready: shows held total and set up payouts', () => {
    const onSetup = vi.fn();
    render(
      <EarningsCard summary={{ ...base, heldCents: 124000, heldCount: 3 }} onSetup={onSetup} />
    );
    expect(screen.getByText('$1,240.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /set up payouts/i }));
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('in flight: shows still-held total and transferring copy', () => {
    render(
      <EarningsCard
        summary={{ ...base, heldCents: 5000, heldCount: 1, payoutsEnabled: true }}
        onSetup={() => {}}
      />
    );
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('Transferring to your account')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('paid out: shows transferred total and paid out copy', () => {
    render(
      <EarningsCard
        summary={{
          ...base,
          transferredCents: 88000,
          lastTransferredAt: '2026-10-10T12:00:00.000Z',
          payoutsEnabled: true,
        }}
        onSetup={() => {}}
      />
    );
    expect(screen.getByText('$880.00')).toBeInTheDocument();
    expect(screen.getByText(/paid out to your stripe account/i)).toBeInTheDocument();
    expect(screen.getByText(/Most recent payout/i)).toBeInTheDocument();
  });

  it('none: renders nothing', () => {
    const { container } = render(<EarningsCard summary={base} onSetup={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
