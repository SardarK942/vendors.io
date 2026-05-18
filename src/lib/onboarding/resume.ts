export type WizardStep = 'basics' | 'location' | 'online' | 'portfolio' | 'payment-mode' | 'review';

export interface ProfileRowShape {
  business_name: string | null;
  category: string | null;
  bio: string | null;
  base_address_line_1: string | null;
  base_city: string | null;
  base_state: string | null;
  base_postal_code: string | null;
  base_google_place_id: string | null;
  instagram_handle: string | null;
  portfolio_images: string[] | null;
  payment_mode: 'stripe' | 'cash' | null;
}

export function nextIncompleteStep(profile: ProfileRowShape | null): WizardStep {
  if (!profile) return 'basics';
  if (!profile.business_name || !profile.category || !profile.bio || profile.bio.length < 50) {
    return 'basics';
  }
  if (
    !profile.base_address_line_1 ||
    !profile.base_city ||
    !profile.base_state ||
    !profile.base_postal_code ||
    !profile.base_google_place_id
  ) {
    return 'location';
  }
  if (!profile.instagram_handle) return 'online';
  if (!profile.portfolio_images || profile.portfolio_images.length < 1) return 'portfolio';
  if (!profile.payment_mode) return 'payment-mode';
  return 'review';
}
