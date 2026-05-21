// Intercepts navigation from /dashboard to /dashboard/bookings/[id] when triggered via
// <Link>. Renders the booking detail inside <PanelShell>. Direct visits and refresh
// bypass the intercept and resolve to /dashboard/bookings/[id]/page.tsx (the full-page
// route).
//
// On mobile (< md:), <PanelShell> redirects to the full-page URL via router.replace().

import { BookingDetail } from '@/components/dashboard/BookingDetail';
import { PanelShell } from '@/components/dashboard/PanelShell';

interface PanelBookingPageProps {
  params: Promise<{ id: string }>;
}

export default async function PanelBookingPage({ params }: PanelBookingPageProps) {
  const { id } = await params;
  return (
    <PanelShell>
      <BookingDetail bookingId={id} mode="panel" />
    </PanelShell>
  );
}
