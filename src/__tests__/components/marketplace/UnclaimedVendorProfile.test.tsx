import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnclaimedVendorProfile } from '@/components/marketplace/UnclaimedVendorProfile';

const fakeVendor = {
  id: 'sv-1',
  slug: 'best-chai-cart-abc123',
  business_name: 'Best Chai Cart',
  category: 'carts',
  city: 'Chicago',
  state: 'IL',
  tags: [],
  instagram_handle: 'bestchaicart',
  website: null,
  bio: 'Some bio',
  photos: ['https://cdn.test/x.jpg'],
};

describe('<UnclaimedVendorProfile>', () => {
  it('renders business name + bio + city', () => {
    render(
      <UnclaimedVendorProfile vendor={fakeVendor} onOpenOwnership={vi.fn()} onIgClick={vi.fn()} />
    );
    expect(screen.getByText(/Best Chai Cart/i)).toBeInTheDocument();
    expect(screen.getByText(/Some bio/i)).toBeInTheDocument();
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument();
  });

  it('renders Unclaimed banner', () => {
    render(
      <UnclaimedVendorProfile vendor={fakeVendor} onOpenOwnership={vi.fn()} onIgClick={vi.fn()} />
    );
    expect(screen.getByText(/hasn['’]t joined Baazar/i)).toBeInTheDocument();
  });

  it('hides IG handle until click; reveals + calls onIgClick when revealed', () => {
    const onIgClick = vi.fn();
    render(
      <UnclaimedVendorProfile vendor={fakeVendor} onOpenOwnership={vi.fn()} onIgClick={onIgClick} />
    );
    expect(screen.queryByText(/bestchaicart/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show on Instagram/i }));
    expect(onIgClick).toHaveBeenCalled();
    expect(screen.getByText(/bestchaicart/i)).toBeInTheDocument();
  });

  it('calls onOpenOwnership when "I own this business" clicked', () => {
    const onOpenOwnership = vi.fn();
    render(
      <UnclaimedVendorProfile
        vendor={fakeVendor}
        onOpenOwnership={onOpenOwnership}
        onIgClick={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /I own this business/i }));
    expect(onOpenOwnership).toHaveBeenCalled();
  });
});
