import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatTile } from '@/components/admin/StatTile';
import { summarizeBookings, type BookingSummaryRow } from '@/lib/admin/metrics';

export const dynamic = 'force-dynamic';

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default async function AdminBookingsPage() {
  const supabase = createServiceRoleClient();

  const { data: rows } = await supabase
    .from('bookings')
    .select('status, deposit_amount, deposit_paid_at, created_at');

  const summary = summarizeBookings((rows ?? []) as BookingSummaryRow[], Date.now());
  const statuses = Object.entries(summary.byStatus).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bookings &amp; revenue</h1>
        <p className="text-ink/60">
          Deposits are the 5% platform fee collected via Stripe; the 95% balance is settled
          off-platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total bookings" value={summary.total} />
        <StatTile label="Deposits collected" value={usd(summary.depositsCollectedCents)} />
        <StatTile label="Deposits paid" value={summary.paidCount} />
        <StatTile label="New (last 7 days)" value={summary.last7dCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bookings by status</CardTitle>
        </CardHeader>
        <CardContent>
          {statuses.length === 0 ? (
            <p className="py-6 text-center text-ink/50">No bookings yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statuses.map(([status, count]) => (
                  <TableRow key={status}>
                    <TableCell className="font-medium">{status}</TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
