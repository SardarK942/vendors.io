// src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookingStickyCard } from '@/components/marketplace/vendor-profile/BookingStickyCard';

const baseVendor = {
  id: 'v-1',
  business_name: 'Epic Events Photo Booth',
  average_rating: 4.9,
  review_count: 47,
  response_sla_hours: 2,
  total_bookings: 3012,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const standardPkg = {
  id: 'p-std',
  name: 'Standard Booth',
  base_price_cents: 120_000,
  duration_hours: 4,
  description: '',
  addons: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const threePackages = [
  { ...standardPkg, id: 'p-std', name: 'Standard', base_price_cents: 120_000 },
  { ...standardPkg, id: 'p-360', name: '360°', base_price_cents: 180_000 },
  { ...standardPkg, id: 'p-prem', name: 'Premium', base_price_cents: 280_000 },
];

describe('BookingStickyCard', () => {
  it('renders the featured (cheapest) package name + total', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
    expect(screen.getByText('$1,200')).toBeInTheDocument();
  });

  it('renders correct 5% deposit math', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/\$60/)).toBeInTheDocument(); // 5% of $1,200
  });

  it('shows "compare all 3 packages ↓" link when 3 packages exist', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/compare all 3 packages/i)).toBeInTheDocument();
  });

  it('hides "compare all packages" link when only 1 package exists', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={[threePackages[0]]}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.queryByText(/compare all/i)).not.toBeInTheDocument();
  });

  it('shows custom-request fallback when 0 packages', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={[]}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/custom request|custom booking/i)).toBeInTheDocument();
  });

  it('renders trust row (rating, response time, events)', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/4.9/)).toBeInTheDocument();
    expect(screen.getByText(/47 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/2h|2 h/i)).toBeInTheDocument();
    expect(screen.getByText(/3,012/)).toBeInTheDocument();
  });

  it('calls onRequestBooking(featuredPkgId) when CTA is clicked', () => {
    const handle = vi.fn();
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={handle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /request booking/i }));
    expect(handle).toHaveBeenCalledWith('p-std');
  });
});
