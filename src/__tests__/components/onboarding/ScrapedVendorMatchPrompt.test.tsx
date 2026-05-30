import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrapedVendorMatchPrompt } from '@/components/onboarding/ScrapedVendorMatchPrompt';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

const fakeMatch: ScrapedVendorMatch = {
  id: 'sv1',
  business_name: 'Best Cart',
  category: 'carts',
  city: 'Chicago',
  instagram_handle: 'bestcart',
  photos: ['https://cdn.test/x.jpg'],
  bio: 'A cart',
  similarity_score: 1,
};

describe('<ScrapedVendorMatchPrompt>', () => {
  it('renders one card per match', () => {
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} onPick={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/Best Cart/i)).toBeInTheDocument();
  });

  it('calls onPick(match.id) when a candidate is selected', () => {
    const onPick = vi.fn();
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} onPick={onPick} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /yes.*this/i }));
    expect(onPick).toHaveBeenCalledWith('sv1');
  });

  it('calls onReject() when "none of these" clicked', () => {
    const onReject = vi.fn();
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} onPick={vi.fn()} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /none of these/i }));
    expect(onReject).toHaveBeenCalled();
  });
});
