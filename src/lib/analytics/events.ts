/** Canonical analytics event names. Keep values stable — funnels reference them. */
export const ANALYTICS_EVENTS = {
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_SUBMITTED: 'signup_submitted',
  SIGNUP_CONFIRMATION_SENT: 'signup_confirmation_sent',
  ONBOARDING_PUBLISH_BLOCKED: 'onboarding_publish_blocked',
  ONBOARDING_PUBLISHED: 'onboarding_published',
  VENDOR_PROFILE_VIEWED: 'vendor_profile_viewed',
  QUOTE_REQUEST_STARTED: 'quote_request_started',
  QUOTE_REQUEST_SUBMITTED: 'quote_request_submitted',
  DEPOSIT_STARTED: 'deposit_started',
  DEPOSIT_COMPLETED: 'deposit_completed',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
