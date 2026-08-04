export type AuthPanelVariant = 'couple' | 'vendor' | 'login';

interface PanelContent {
  heading: string;
  subcopy: string;
  chips: string[];
}

export const AUTH_PANEL_CONTENT: Record<AuthPanelVariant, PanelContent> = {
  couple: {
    heading: 'Plan your celebration with Baazar',
    subcopy:
      'Chicago’s marketplace for culturally-focused wedding and event vendors — discover, compare, and book with confidence.',
    chips: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
  vendor: {
    heading: 'Join Baazar as a Vendor',
    subcopy:
      'List your business on the marketplace built for cultural weddings and reach couples who are ready to book.',
    chips: [
      'No listing fees',
      'Verified leads with a pre-committed deposit',
      'A culture-focused vendor marketplace',
    ],
  },
  login: {
    heading: 'Welcome back',
    subcopy: 'Sign in to manage your bookings, quotes, and profile on Baazar.',
    chips: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
};
