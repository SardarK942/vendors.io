// src/__tests__/components/vendor-profile/IdentityPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdentityPanel } from '@/components/marketplace/vendor-profile/IdentityPanel';

// IdentityPanel now carries ONLY the bio. Name, verified, languages, and
// location moved to VendorHero (see VendorHero.test.tsx).
const baseVendor = {
  id: 'v-1',
  business_name: 'Epic Events Photo Booth',
  category: 'photography',
  service_area: ['Chicago'],
  languages: ['English'],
  bio: '3,000+ events served.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('IdentityPanel', () => {
  it('renders a short single-line bio as a pull-quote with an "About" label', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('3,000+ events served.')).toBeInTheDocument();
    expect(screen.getByText(/about/i)).toBeInTheDocument();
  });

  it('renders a long bio as prose', () => {
    const long = 'A full paragraph about the studio. '.repeat(6); // > 90 chars
    render(<IdentityPanel vendor={{ ...baseVendor, bio: long }} />);
    expect(screen.getByText(long.trim())).toBeInTheDocument();
  });

  it('renders nothing when bio is null', () => {
    const { container } = render(<IdentityPanel vendor={{ ...baseVendor, bio: null }} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/about/i)).not.toBeInTheDocument();
  });

  it('does not render identity fields that moved to VendorHero', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.queryByText('Epic Events Photo Booth')).not.toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });
});
