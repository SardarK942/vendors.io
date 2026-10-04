import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentsClient } from '@/app/dashboard/profile/payments/PaymentsClient';

describe('PaymentsClient', () => {
  it('shows the connect CTA when not connected', () => {
    render(
      <PaymentsClient
        status={{
          connected: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        }}
      />
    );
    expect(screen.getByRole('button', { name: /set up payouts/i })).toBeInTheDocument();
  });

  it('shows "finish verification" when details submitted but not charge-ready', () => {
    render(
      <PaymentsClient
        status={{
          connected: true,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: true,
        }}
      />
    );
    expect(screen.getByRole('button', { name: /finish verif/i })).toBeInTheDocument();
  });

  it('shows the ready state when charges are enabled', () => {
    render(
      <PaymentsClient
        status={{
          connected: true,
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        }}
      />
    );
    expect(screen.getByText(/set up to get paid/i)).toBeInTheDocument();
  });
});
