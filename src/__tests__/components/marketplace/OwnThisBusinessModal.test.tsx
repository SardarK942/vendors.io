import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OwnThisBusinessModal } from '@/components/marketplace/OwnThisBusinessModal';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, requestId: 'req-1' }),
  }) as unknown as typeof fetch;
});

describe('<OwnThisBusinessModal>', () => {
  it('renders initial choice view when open', () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    expect(screen.getByText(/Remove my listing/i)).toBeInTheDocument();
    expect(screen.getByText(/Get help claiming/i)).toBeInTheDocument();
  });

  it('navigates to remove form on selection', () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Remove my listing/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getByRole('heading', { name: /Remove this listing/i })).toBeInTheDocument();
  });

  it('navigates to claim form on selection', () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Get help claiming/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.getByRole('heading', { name: /Claim your business/i })).toBeInTheDocument();
  });

  it('posts to /request with action=remove when remove form submitted', async () => {
    const onClose = vi.fn();
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/Remove my listing/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'vendor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send removal request/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/scraped-vendors/sv-1/request');
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.action).toBe('remove');
    expect(body.requester_email).toBe('vendor@example.com');
  });

  it('posts to /request with action=claim_request when claim form submitted', async () => {
    render(<OwnThisBusinessModal open vendorId="sv-1" businessName="Test" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Get help claiming/i));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'vendor@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Instagram handle/i), {
      target: { value: '@bestchai' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Request claim link/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(
      ((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit)
        .body as string
    );
    expect(body.action).toBe('claim_request');
    expect(body.requester_ig).toBe('@bestchai');
  });
});
