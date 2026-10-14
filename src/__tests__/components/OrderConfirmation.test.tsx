import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  OrderConfirmation,
  type OrderConfirmationOrder,
} from '@/components/shop/OrderConfirmation';

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
        variantLabel: 'M',
        unitPriceCents: 240000,
        quantity: 1,
        customizationType: 'made_to_measure',
        measurementSnapshot: { unit: 'in', measurements: { bust: 36 } },
        imageUrl: 'https://example.com/l.jpg',
      },
      {
        id: 'i2',
        name: 'Silk Organza Dupatta',
        variantLabel: 'Crimson',
        unitPriceCents: 32000,
        quantity: 1,
        customizationType: null,
        measurementSnapshot: null,
        imageUrl: null,
      },
    ],
  };
}

describe('OrderConfirmation', () => {
  it('shows the hold-not-charged total, countdown and three timeline steps', () => {
    render(<OrderConfirmation order={makeOrder()} now={NOW} />);
    expect(screen.getByText('Total on hold')).toBeInTheDocument();
    expect(screen.getByText('Not yet charged')).toBeInTheDocument();
    expect(screen.getAllByText('$2,958.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/47 hours left/)).toBeInTheDocument();
    expect(screen.getByText(/Order placed and hold authorized/)).toBeInTheDocument();
    expect(screen.getByText(/Zara Bridal Couture confirms, within 48 hours/)).toBeInTheDocument();
    expect(screen.getByText(/then ready for pickup/)).toBeInTheDocument();
    expect(screen.getByText(/Measurements locked in/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View your orders/ })).toHaveAttribute(
      'href',
      '/orders'
    );
  });
});
