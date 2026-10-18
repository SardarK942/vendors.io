import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    offersPickup: true,
    offersShipping: true,
    shippingFeeCents: 2500,
    lines: [
      {
        cartItemId: 'ci1',
        productId: 'p1',
        title: 'Hand-embroidered Bridal Lehenga',
        sizeLabel: 'M',
        garmentType: 'lehenga',
        measurementProfileId: ready ? 'mp1' : null,
        imageUrl: 'https://example.com/l.jpg',
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

  it('shows the ship fee, the product thumbnail, and only offered modes', () => {
    const { rerender } = render(<BagBoutiqueCard cart={makeCart(true)} profiles={[]} />);
    expect(screen.getByRole('button', { name: /ship.*\+\$25\.00/i })).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/l.jpg');
    rerender(<BagBoutiqueCard cart={{ ...makeCart(true), offersPickup: false }} profiles={[]} />);
    expect(screen.queryByRole('button', { name: /pickup/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ship/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores stock for made-to-measure quantity but caps ready-made lines', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const base = makeCart(true);
    const mtm = { ...base, lines: [{ ...base.lines[0], stockQuantity: 0, quantity: 1 }] };
    const { unmount } = render(<BagBoutiqueCard cart={mtm} profiles={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    fetchMock.mockClear();
    const ready = {
      ...base,
      lines: [{ ...base.lines[0], isMadeToMeasure: false, stockQuantity: 1, quantity: 1 }],
    };
    render(<BagBoutiqueCard cart={ready} profiles={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
