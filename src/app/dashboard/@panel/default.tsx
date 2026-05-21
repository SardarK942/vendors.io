// Empty fallback for the @panel slot. Renders when no booking is selected (i.e. the
// user is on /dashboard, /dashboard/bookings, /dashboard/money, etc. — anywhere the
// intercept route doesn't match). Returning null keeps the slot empty.
export default function PanelDefault() {
  return null;
}
