import { Card } from '@/components/ui/card';
import type { CashToCollectRow } from '@/services/payment.service';

export function CashToCollect({ rows }: { rows: CashToCollectRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No upcoming events with cash to collect.
      </Card>
    );
  }
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">
        ${(total / 100).toLocaleString()} to collect over the next 30 days
      </div>
      {rows.map((r) => (
        <Card key={r.bookingEventId} className="flex items-center justify-between p-4">
          <div>
            <div className="font-medium">
              {new Date(r.eventDate + 'T12:00:00Z').toLocaleDateString()} · {r.coupleName}
            </div>
            <div className="text-xs text-muted-foreground">{r.packageLabel}</div>
          </div>
          <div className="text-right font-semibold">
            ${(r.amountCents / 100).toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}
