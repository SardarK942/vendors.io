/**
 * Bucket B T6: BookingForm guest count derived from package event count.
 *
 * Schema reality: packages has `events_count` (integer), not a package_events
 * join table. Guest count inputs are derived from the number of EventRows.
 *
 * Single-event  → one input labelled /how many guests/i
 * Multi-event   → one input per event labelled /guests for event [N]/i
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingForm } from '@/components/forms/BookingForm';

// ── Next.js mocks ──────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...rest }: { alt: string; [k: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(rest as Record<string, unknown>)} />
  ),
}));

// ── Heavy sub-component mocks (network / calendar / maps) ──────────
vi.mock('@/components/marketplace/AvailabilityCalendar', () => ({
  AvailabilityCalendar: ({ onSelect }: { onSelect: (d: string) => void }) => (
    <button type="button" onClick={() => onSelect('2025-01-01')}>
      Pick date
    </button>
  ),
}));

vi.mock('@/components/forms/GooglePlacesAutocomplete', () => ({
  GooglePlacesAutocomplete: () => <div>Places</div>,
}));

vi.mock('@/components/forms/EventTypeAutocomplete', () => ({
  EventTypeAutocomplete: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => <input value={value} onChange={(e) => onChange(e.target.value)} />,
}));

// ── Shared vendor fixture ───────────────────────────────────────────
const VENDOR = {
  id: 'v-1',
  slug: 'test-vendor',
  business_name: 'Test Vendor',
};

// ── Package fixtures ────────────────────────────────────────────────
const SINGLE_EVENT_PKG = {
  id: 'pkg-1',
  name: 'Basic Package',
  description: 'A basic package',
  base_price_cents: 100_000,
  events_count: 1,
  max_guests: 200,
  duration_hours: 8,
  featured_image_url: 'https://cdn.test/img.jpg',
  location_mode: 'couple_provides' as const,
};

const MULTI_EVENT_PKG = {
  id: 'pkg-2',
  name: 'Full Package',
  description: 'A full package',
  base_price_cents: 200_000,
  events_count: 3,
  max_guests: 500,
  duration_hours: 24,
  featured_image_url: 'https://cdn.test/img.jpg',
  location_mode: 'couple_provides' as const,
};

// ── Tests ───────────────────────────────────────────────────────────
describe('BookingForm guest count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one guest-count input for a single-event package', () => {
    render(<BookingForm vendor={VENDOR} pkg={SINGLE_EVENT_PKG} selectedAddons={[]} />);
    const inputs = screen.getAllByLabelText(/how many guests/i);
    expect(inputs).toHaveLength(1);
  });

  it('renders N guest-count inputs for a multi-event package', () => {
    render(<BookingForm vendor={VENDOR} pkg={MULTI_EVENT_PKG} selectedAddons={[]} />);
    // Expect one input per event in the package
    expect(screen.getByLabelText(/guests for event 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/guests for event 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/guests for event 3/i)).toBeInTheDocument();
  });

  it('defaults each guest-count input to 50', () => {
    render(<BookingForm vendor={VENDOR} pkg={MULTI_EVENT_PKG} selectedAddons={[]} />);
    const input1 = screen.getByLabelText(/guests for event 1/i) as HTMLInputElement;
    expect(input1.value).toBe('50');
  });

  it('does NOT render the old "Total Guest Count" label for single-event', () => {
    render(<BookingForm vendor={VENDOR} pkg={SINGLE_EVENT_PKG} selectedAddons={[]} />);
    expect(screen.queryByLabelText(/total guest count/i)).toBeNull();
  });

  it('does NOT render the old "Total Guest Count" label for multi-event', () => {
    render(<BookingForm vendor={VENDOR} pkg={MULTI_EVENT_PKG} selectedAddons={[]} />);
    expect(screen.queryByLabelText(/total guest count/i)).toBeNull();
  });
});
