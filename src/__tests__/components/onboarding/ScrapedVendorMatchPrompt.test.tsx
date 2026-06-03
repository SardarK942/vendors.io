import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrapedVendorMatchPrompt } from '@/components/onboarding/ScrapedVendorMatchPrompt';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

const fakeMatch: ScrapedVendorMatch = {
  id: 'sv1',
  slug: 'best-cart-abc123',
  business_name: 'Best Cart',
  category: 'carts',
  city: 'Chicago',
  instagram_handle: 'bestcart',
  photos: ['https://cdn.test/x.jpg'],
  bio: 'A cart',
  similarity_score: 1,
};

describe('<ScrapedVendorMatchPrompt> (block view)', () => {
  it('renders the matched listing header + claim instructions', () => {
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} />);
    expect(screen.getByText(/We already have a listing/i)).toBeInTheDocument();
    expect(screen.getByText(/Best Cart/i)).toBeInTheDocument();
    expect(screen.getByText(/I own this business/i)).toBeInTheDocument();
  });

  it('links to the unclaimed listing via slug', () => {
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} />);
    const link = screen.getByRole('link', { name: /Visit my listing/i });
    expect(link).toHaveAttribute('href', '/vendors/best-cart-abc123');
  });

  it('renders null when matches is empty', () => {
    const { container } = render(<ScrapedVendorMatchPrompt matches={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
