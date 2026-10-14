import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BagBoutiqueCard } from '@/components/shop/BagBoutiqueCard';
import type { BoutiqueCart } from '@/services/cart.service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/measurements/GuidedMeasurementModal', () => ({
  GuidedMeasurementModal: () => null,
}));

function makeCart(ready: boolean): BoutiqueCart {
  return {
    vendorProfileId: 'v1',
    vendorName: 'Zara Bridal Couture',
    subtotalCents: 240000,
    ready,
    lines: [
      {
        cartItemId: 'ci1',
        productId: 'p1',
        title: 'Hand-embroidered Bridal Lehenga',
        sizeLabel: 'M',
        garmentType: 'lehenga',
        measurementProfileId: ready ? 'mp1' : null,
        variantId: 'var1',
        unitPriceCents: 240000,
        quantity: 1,
        stockQuantity: 3,
        isMadeToMeasure: true,
        measurementResolved: ready,
      },
    ],
  };
}

describe('BagBoutiqueCard', () => {
  it('disables checkout and shows the helper note while a made-to-measure line is unresolved', () => {
    render(<BagBoutiqueCard cart={makeCart(false)} profiles={[]} />);
    expect(screen.getByRole('button', { name: /check out this boutique/i })).toBeDisabled();
    expect(screen.getByText(/add measurements to continue/i)).toBeInTheDocument();
  });

  it('enables checkout once the boutique is ready', () => {
    const { rerender } = render(<BagBoutiqueCard cart={makeCart(false)} profiles={[]} />);
    rerender(<BagBoutiqueCard cart={makeCart(true)} profiles={[]} />);
    expect(screen.getByRole('button', { name: /check out this boutique/i })).toBeEnabled();
    expect(screen.queryByText(/add measurements to continue/i)).not.toBeInTheDocument();
  });
});
