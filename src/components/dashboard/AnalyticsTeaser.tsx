import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAnalyticsTeaser, type TeaserMetric } from '@/services/analytics.service';

function deltaLabel(d: TeaserMetric): string {
  if (d.delta === 0) return '— vs last week';
  const arrow = d.delta > 0 ? '↑' : '↓';
  return `${arrow}${Math.abs(d.delta)} vs last week`;
}

function deltaClass(d: TeaserMetric): string {
  if (d.delta > 0) return 'text-emerald-600';
  if (d.delta < 0) return 'text-red-600';
  return 'text-muted-foreground';
}

export async function AnalyticsTeaser({ vendorProfileId }: { vendorProfileId: string }) {
  const supabase = await createServerSupabaseClient();
  const teaser = await getAnalyticsTeaser(supabase, vendorProfileId);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          This week
        </h2>
        <Button asChild variant="link" className="h-auto p-0 text-sm">
          <Link href="/dashboard/analytics">Full analytics →</Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Profile views</div>
          <div className="mt-1 text-2xl font-semibold">{teaser.views.count}</div>
          <div className={`mt-1 text-xs ${deltaClass(teaser.views)}`}>
            {deltaLabel(teaser.views)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Inquiries</div>
          <div className="mt-1 text-2xl font-semibold">{teaser.inquiries.count}</div>
          <div className={`mt-1 text-xs ${deltaClass(teaser.inquiries)}`}>
            {deltaLabel(teaser.inquiries)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Bookings</div>
          <div className="mt-1 text-2xl font-semibold">{teaser.bookings.count}</div>
          <div className={`mt-1 text-xs ${deltaClass(teaser.bookings)}`}>
            {deltaLabel(teaser.bookings)}
          </div>
        </div>
      </div>
    </section>
  );
}
