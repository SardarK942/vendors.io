import { Card, CardContent } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';
import Link from 'next/link';

interface UnlockedBooking {
  id: string;
  completed_at: string | null;
  event_type: string;
  vendor_payout_total: number;
  couple_name: string | null;
}

interface RecentUnlocksProps {
  unlocks: UnlockedBooking[];
}

export function RecentUnlocks({ unlocks }: RecentUnlocksProps) {
  if (unlocks.length === 0) return null;

  const totalUnlocked = unlocks.reduce((sum, u) => sum + u.vendor_payout_total, 0);

  return (
    <Card className="border-emerald-200 bg-emerald-50 sm:col-span-2 lg:col-span-3">
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-emerald-900">
          {formatPrice(totalUnlocked)} unlocked in the last 7 days
        </p>
        <ul className="mt-2 space-y-1 text-sm text-emerald-900/80">
          {unlocks.map((u) => (
            <li key={u.id}>
              <Link href={`/dashboard/bookings/${u.id}`} className="hover:underline">
                {formatPrice(u.vendor_payout_total)} — {u.event_type}
                {u.couple_name ? ` with ${u.couple_name}` : ''}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
