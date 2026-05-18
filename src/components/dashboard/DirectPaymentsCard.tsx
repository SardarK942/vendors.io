// src/components/dashboard/DirectPaymentsCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  confirmedBookings: number;
  upcomingEvents: number;
}

export function DirectPaymentsCard({ confirmedBookings, upcomingEvents }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Direct payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Confirmed bookings</span>
          <span className="font-semibold">{confirmedBookings}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Upcoming events</span>
          <span className="font-semibold">{upcomingEvents}</span>
        </div>
        <p className="text-xs text-muted-foreground pt-3 mt-3 border-t">
          Payments tracked outside Baazar. Coordinate directly with each couple.
        </p>
      </CardContent>
    </Card>
  );
}
