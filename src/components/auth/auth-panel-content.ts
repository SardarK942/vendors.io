export type AuthPanelVariant = 'couple' | 'vendor' | 'login';

interface PanelContent {
  heading: string;
  subcopy: string;
  /** Section label above the numbered benefit cards. */
  cardsLabel: string;
  /** Exactly three short benefit labels, rendered as numbered glass cards. */
  cards: [string, string, string];
}

export const AUTH_PANEL_CONTENT: Record<AuthPanelVariant, PanelContent> = {
  couple: {
    heading: 'Plan your celebration with Baazar',
    subcopy:
      'Chicago’s marketplace for culturally-focused wedding and event vendors — discover, compare, and book with confidence.',
    cardsLabel: 'Get Started with Us',
    cards: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
  vendor: {
    heading: 'Join Baazar as a Vendor',
    subcopy:
      'It’s completely free to list — no monthly or listing fees. Our goal is to send you serious, pre-committed leads, not random inquiries.',
    cardsLabel: 'Get Started with Us',
    cards: ['No listing fees', 'Serious, pre-committed leads', 'Founding vendor — easy onboarding'],
  },
  login: {
    heading: 'Good to see you again',
    subcopy: 'Sign in to manage your bookings, quotes, and profile on Baazar.',
    cardsLabel: 'Why Baazar',
    cards: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
};
