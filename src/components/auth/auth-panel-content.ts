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
    heading: 'Become a founding vendor',
    subcopy:
      'It’s completely free to list — no monthly or listing fees. Our goal is to send you serious, pre-committed leads, not random inquiries.',
    chips: [
      'Completely free — no monthly or listing fees',
      'Serious, pre-committed leads — not random inquiries',
      'Founding-vendor status with easy onboarding',
    ],
  },
  login: {
    heading: 'Good to see you again',
    subcopy: 'Sign in to manage your bookings, quotes, and profile on Baazar.',
    chips: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
};
