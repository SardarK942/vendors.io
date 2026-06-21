import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PayoutHistoryRow } from '@/services/payment.service';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_transit: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-700',
};

export function PayoutHistory({ rows }: { rows: PayoutHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No payout history yet. Your Stripe payout history (legacy) will appear here.
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((p) => (
        <Card key={p.id} className="flex items-center justify-between p-4">
          <div>
            <div className="font-medium">
              {p.arrival_date
                ? new Date(p.arrival_date + 'T12:00:00Z').toLocaleDateString()
                : 'pending'}{' '}
              · ${(p.amount_cents / 100).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              {p.bookings_count} {p.bookings_count === 1 ? 'booking' : 'bookings'}
              {p.failure_message ? ` · ${p.failure_message}` : ''}
            </div>
          </div>
          <Badge className={statusColor[p.status] ?? ''}>{p.status}</Badge>
        </Card>
      ))}
    </div>
  );
}
