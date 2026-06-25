// src/__tests__/components/vendor-profile/IdentityPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdentityPanel } from '@/components/marketplace/vendor-profile/IdentityPanel';

const baseVendor = {
  id: 'v-1',
  business_name: 'Epic Events Photo Booth',
  verified: true,
  category: 'photography',
  service_area: ['Chicago', 'Naperville'],
  languages: ['English', 'Spanish', 'Hindi'],
  years_in_business: 12,
  bio: '3,000+ events served.',
  response_sla_hours: 2,
  // ... other VendorRow fields can be null/undefined for this component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('IdentityPanel', () => {
  it('renders name and verified badge', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('Epic Events Photo Booth')).toBeInTheDocument();
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it('hides verified badge when vendor.verified === false', () => {
    render(<IdentityPanel vendor={{ ...baseVendor, verified: false }} />);
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('renders the bio prose', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('3,000+ events served.')).toBeInTheDocument();
  });

  it('renders language chips', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    expect(screen.getByText('Hindi')).toBeInTheDocument();
  });

  it('hides bio section when bio is null', () => {
    render(<IdentityPanel vendor={{ ...baseVendor, bio: null }} />);
    expect(screen.queryByText(/about/i)).not.toBeInTheDocument();
  });

  it('falls back to "Chicago" when service_area is null', () => {
    render(<IdentityPanel vendor={{ ...baseVendor, service_area: null }} />);
    expect(screen.getByText(/chicago/i)).toBeInTheDocument();
  });
});
