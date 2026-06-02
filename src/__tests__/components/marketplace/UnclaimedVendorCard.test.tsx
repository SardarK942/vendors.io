import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnclaimedVendorCard } from '@/components/marketplace/UnclaimedVendorCard';

const fakeVendor = {
  id: 'sv-1',
  slug: 'best-chai-cart-abc123',
  business_name: 'Best Chai Cart',
  category: 'carts',
  city: 'Chicago',
  state: 'IL',
  instagram_handle: 'bestchaicart',
  bio: null,
  photos: ['https://cdn.test/x.jpg'],
};

describe('<UnclaimedVendorCard>', () => {
  it('renders business name', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    expect(screen.getByText(/Best Chai Cart/i)).toBeInTheDocument();
  });

  it('renders an Unclaimed badge', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    expect(screen.getByText(/unclaimed/i)).toBeInTheDocument();
  });

  it('renders link to the slug page', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/vendors/best-chai-cart-abc123');
  });

  it('renders category + city in the meta line', () => {
    render(<UnclaimedVendorCard vendor={fakeVendor} />);
    expect(screen.getByText(/carts/i)).toBeInTheDocument();
    expect(screen.getByText(/Chicago/i)).toBeInTheDocument();
  });
});
