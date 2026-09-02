import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoVideoComboCallout } from '@/components/marketplace/filters/PhotoVideoComboCallout';
import { useFilterState } from '@/components/marketplace/filters/use-filter-state';
import type { FilterState } from '@/components/marketplace/filters/use-filter-state';

vi.mock('@/components/marketplace/filters/use-filter-state', () => ({
  useFilterState: vi.fn(),
}));

const apply = vi.fn();

function mockState(overrides: Partial<FilterState>) {
  (useFilterState as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    state: {
      q: '',
      category: null,
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
    apply,
  });
}

describe('<PhotoVideoComboCallout />', () => {
  beforeEach(() => apply.mockClear());

  it('renders nothing for unrelated categories', () => {
    mockState({ category: 'carts' });
    const { container } = render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no category is active', () => {
    mockState({ category: null });
    const { container } = render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no dual studios exist (gate), off state', () => {
    mockState({ category: 'photography', photoVideoCombo: false });
    const { container } = render(<PhotoVideoComboCallout hasPhotoVideoStudios={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('still renders when the filter is already on, even if the count gate is false', () => {
    // The clear affordance must stay reachable for an active filter.
    mockState({ category: 'photography', photoVideoCombo: true });
    render(<PhotoVideoComboCallout hasPhotoVideoStudios={false} />);
    expect(screen.getByRole('button', { name: /show all photographers/i })).toBeInTheDocument();
  });

  it('shows the invitation on Photography, off state', () => {
    mockState({ category: 'photography', photoVideoCombo: false });
    render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    expect(screen.getByText(/prefer one team for both/i)).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /show photo \+ video studios/i });
    expect(cta).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the invitation on Videography too', () => {
    mockState({ category: 'videography', photoVideoCombo: false });
    render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    expect(
      screen.getByRole('button', { name: /show photo \+ video studios/i })
    ).toBeInTheDocument();
  });

  it('shows the active/confirmation state when the filter is on', () => {
    mockState({ category: 'photography', photoVideoCombo: true });
    render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    expect(screen.getByText(/showing studios that do both/i)).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /show all photographers/i });
    expect(cta).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns the combo filter on from the off state', () => {
    mockState({ category: 'photography', photoVideoCombo: false });
    render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    fireEvent.click(screen.getByRole('button', { name: /show photo \+ video studios/i }));
    expect(apply).toHaveBeenCalledWith({ photoVideoCombo: true });
  });

  it('clears the combo filter from the on state', () => {
    mockState({ category: 'photography', photoVideoCombo: true });
    render(<PhotoVideoComboCallout hasPhotoVideoStudios />);
    fireEvent.click(screen.getByRole('button', { name: /show all photographers/i }));
    expect(apply).toHaveBeenCalledWith({ photoVideoCombo: false });
  });
});
