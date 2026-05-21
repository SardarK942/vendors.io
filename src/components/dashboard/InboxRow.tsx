import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export interface InboxRowData {
  bookingId: string;
  coupleName: string;
  packageLabel: string;
  status: string;
  receivedAt: string; // ISO
  urgencyHours?: number; // optional countdown for "18h left"
}

function statusChip(status: string) {
  if (status === 'pending')
    return { label: 'New request', cls: 'bg-blue-100 text-blue-800' };
  if (status === 'adjusted_quote_declined')
    return { label: 'Adjustment declined', cls: 'bg-orange-100 text-orange-800' };
  if (status === 'accepted')
    return { label: 'Awaiting deposit', cls: 'bg-yellow-100 text-yellow-800' };
  if (status === 'adjusted_quote_sent')
    return { label: 'Quote sent', cls: 'bg-purple-100 text-purple-800' };
  return { label: status, cls: 'bg-gray-100 text-gray-700' };
}

export function InboxRow({ data }: { data: InboxRowData }) {
  const chip = statusChip(data.status);
  return (
    <Link
      href={`/dashboard/bookings/${data.bookingId}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{data.coupleName}</div>
          <div className="truncate text-sm text-muted-foreground">{data.packageLabel}</div>
        </div>
        <div className="shrink-0 text-right">
          <Badge className={chip.cls}>{chip.label}</Badge>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(data.receivedAt), { addSuffix: true })}
          </div>
          {data.urgencyHours !== undefined && (
            <div className="mt-1 text-xs font-medium text-red-600">
              {data.urgencyHours}h left
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
