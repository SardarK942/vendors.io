import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterChipRow } from '@/components/marketplace/filters/FilterChipRow';
import { useFilterState } from '@/components/marketplace/filters/use-filter-state';
import { useSearchParams } from 'next/navigation';
import type { FilterState } from '@/components/marketplace/filters/use-filter-state';

vi.mock('next/navigation', () => ({ useSearchParams: vi.fn() }));
vi.mock('@/components/marketplace/filters/use-filter-state', () => ({
  useFilterState: vi.fn(),
}));

const apply = vi.fn();

function setup(category: string | null, overrides: Partial<FilterState> = {}) {
  (useSearchParams as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    get: (k: string) => (k === 'category' ? category : null),
  });
  (useFilterState as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    state: {
      q: '',
      category,
      verified: false,
      respondsIn: 0,
      priceBand: null,
      priceMin: null,
      priceMax: null,
      languages: [],
      years: 0,
      events: [],
      subcategories: [],
      photoVideoCombo: false,
      ...overrides,
    },
    patch: vi.fn(),
    reset: vi.fn(),
    activeDropdown: null,
    setActiveDropdown: vi.fn(),
    sheetOpen: false,
    setSheetOpen: vi.fn(),
    apply,
  });
}

const photoVideoChip = () => screen.queryByRole('button', { name: /photo \+ video/i });

describe('FilterChipRow — photo + video combo toggle', () => {
  beforeEach(() => apply.mockClear());

  it('shows the toggle when Photography is the active category', () => {
    setup('photography');
    render(<FilterChipRow onOpenSheet={() => {}} />);
    expect(photoVideoChip()).toBeInTheDocument();
  });

  it('shows the toggle when Videography is the active category', () => {
    setup('videography');
    render(<FilterChipRow onOpenSheet={() => {}} />);
    expect(photoVideoChip()).toBeInTheDocument();
  });

  it('hides the toggle for unrelated categories', () => {
    setup('carts');
    render(<FilterChipRow onOpenSheet={() => {}} />);
    expect(photoVideoChip()).not.toBeInTheDocument();
  });

  it('hides the toggle when no category is active (All)', () => {
    setup(null);
    render(<FilterChipRow onOpenSheet={() => {}} />);
    expect(photoVideoChip()).not.toBeInTheDocument();
  });

  it('reflects the active state via aria-pressed', () => {
    setup('photography', { photoVideoCombo: true });
    render(<FilterChipRow onOpenSheet={() => {}} />);
    expect(photoVideoChip()).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies photoVideoCombo=true on click when off', () => {
    setup('photography', { photoVideoCombo: false });
    render(<FilterChipRow onOpenSheet={() => {}} />);
    fireEvent.click(photoVideoChip()!);
    expect(apply).toHaveBeenCalledWith({ photoVideoCombo: true });
  });

  it('applies photoVideoCombo=false on click when on', () => {
    setup('photography', { photoVideoCombo: true });
    render(<FilterChipRow onOpenSheet={() => {}} />);
    fireEvent.click(photoVideoChip()!);
    expect(apply).toHaveBeenCalledWith({ photoVideoCombo: false });
  });
});
