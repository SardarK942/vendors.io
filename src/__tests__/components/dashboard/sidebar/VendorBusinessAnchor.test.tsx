import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VendorBusinessAnchor } from '@/components/dashboard/sidebar/VendorBusinessAnchor';

describe('VendorBusinessAnchor', () => {
  it('renders nothing when business is null', () => {
    const { container } = render(<VendorBusinessAnchor business={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders name and city without a verified pill when not verified', () => {
    render(
      <VendorBusinessAnchor
        business={{ business_name: 'Rose Petal Events', verified: false, city: 'Lahore' }}
      />
    );
    expect(screen.getByText('Rose Petal Events')).toBeInTheDocument();
    expect(screen.getByText('Lahore')).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it('renders name, verified pill, and city when verified with a city', () => {
    render(
      <VendorBusinessAnchor
        business={{ business_name: 'Rose Petal Events', verified: true, city: 'Karachi' }}
      />
    );
    expect(screen.getByText('Rose Petal Events')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Karachi')).toBeInTheDocument();
  });
});
