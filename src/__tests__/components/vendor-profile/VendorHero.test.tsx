// src/__tests__/components/vendor-profile/VendorHero.test.tsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VendorHero } from '@/components/marketplace/vendor-profile/VendorHero';
import { SavedVendorsProvider } from '@/components/marketplace/SavedVendorsProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/vendors/epic-events',
}));

beforeAll(() => {
  // framer-motion's useReducedMotion reads window.matchMedia, which jsdom lacks.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

const baseVendor = {
  id: 'v-1',
  business_name: 'Epic Events Photo Booth',
  category: 'photography',
  service_area: ['Chicago', 'Naperville'],
  languages: ['English', 'Spanish', 'Hindi'],
  years_in_business: 12,
  verified: true,
  response_sla_hours: 2,
  average_rating: null,
  review_count: 0,
  portfolio_images: [], // empty → monogram fallback, avoids next/image in jsdom
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderHero(vendor: any = baseVendor) {
  return render(
    <SavedVendorsProvider authenticated={false}>
      <VendorHero vendor={vendor} interactive />
    </SavedVendorsProvider>
  );
}

describe('VendorHero', () => {
  it('renders the business name and category kicker', () => {
    renderHero();
    expect(screen.getByRole('heading', { name: 'Epic Events Photo Booth' })).toBeInTheDocument();
    expect(screen.getByText('Photography')).toBeInTheDocument();
  });

  it('shows the verified badge when verified', () => {
    renderHero();
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it('hides the verified badge when not verified', () => {
    renderHero({ ...baseVendor, verified: false });
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('renders languages and location', () => {
    renderHero();
    expect(screen.getByText('English, Spanish, Hindi')).toBeInTheDocument();
    expect(screen.getByText(/Chicago/)).toBeInTheDocument();
  });

  it('falls back to "Chicago" when service_area is null', () => {
    renderHero({ ...baseVendor, service_area: null });
    expect(screen.getByText('Chicago')).toBeInTheDocument();
  });
});
