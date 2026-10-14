import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VendorOrderConfirm } from '@/components/shop/VendorOrderConfirm';
import type { OrderConfirmationOrder } from '@/components/shop/OrderConfirmation';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const NOW = new Date('2026-10-14T10:00:00Z');

function makeOrder(): OrderConfirmationOrder {
  return {
    id: 'o1',
    status: 'pending_confirmation',
    vendorName: 'Zara Bridal Couture',
    fulfillmentType: 'pickup',
    itemSubtotalCents: 272000,
    shippingCents: 0,
    taxCents: 23800,
    totalCents: 295800,
    confirmDeadlineAt: new Date(NOW.getTime() + 47 * 3600 * 1000).toISOString(),
    items: [
      {
        id: 'i1',
        name: 'Hand-embroidered Bridal Lehenga',
        variantLabel: null,
        unitPriceCents: 240000,
        quantity: 1,
        customizationType: 'made_to_measure',
        measurementSnapshot: { unit: 'in', measurements: { bust: 36, lehenga_waist: 31 } },
        imageUrl: null,
      },
    ],
  };
}

describe('VendorOrderConfirm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockClear();
  });

  it('shows submitted measurements and the payout breakdown', () => {
    render(<VendorOrderConfirm order={makeOrder()} chargesEnabled now={NOW} />);
    expect(screen.getByText('Needs your confirmation')).toBeTruthy();
    expect(screen.getByText('Bust')).toBeTruthy();
    expect(screen.getByText('36')).toBeTruthy();
    expect(screen.getByText('Lehenga waist')).toBeTruthy();
    expect(screen.getByText('Baazar fee (10%)')).toBeTruthy();
    expect(screen.getByText('-$272.00')).toBeTruthy();
    expect(screen.getByText('$2,448.00')).toBeTruthy();
    expect(screen.queryByText(/haven't finished payout setup/i)).toBeNull();
  });

  it('shows the escrow note when not charge-enabled', () => {
    render(<VendorOrderConfirm order={makeOrder()} chargesEnabled={false} now={NOW} />);
    expect(screen.getByText(/haven.t finished/i)).toBeTruthy();
  });

  it("opens a confirm step for Can't fulfill without posting", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<VendorOrderConfirm order={makeOrder()} chargesEnabled now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: /can.t fulfill/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('posts to /confirm when confirming', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<VendorOrderConfirm order={makeOrder()} chargesEnabled now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm, i.ll make this/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/orders/o1/confirm', { method: 'POST' })
    );
  });
});
