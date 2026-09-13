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
import { summarizeMarketplace, type ProfileHealthRow } from '@/lib/admin/metrics';

export const dynamic = 'force-dynamic';

export default async function AdminMarketplacePage() {
  const supabase = createServiceRoleClient();

  const [{ data: rows }, missingEmbeddings] = await Promise.all([
    supabase
      .from('vendor_profiles')
      .select('category, verified, user_id, onboarding_complete, is_active'),
    // Live vendors with no embedding are invisible to semantic search — count
    // them directly rather than shipping every vector to compute it.
    supabase
      .from('vendor_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('onboarding_complete', true)
      .is('embedding', null),
  ]);

  const summary = summarizeMarketplace((rows ?? []) as ProfileHealthRow[]);
  const missingEmbeddingCount = missingEmbeddings.count ?? 0;

  const categories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
  const maxCat = categories[0]?.[1] || 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketplace health</h1>
        <p className="text-ink/60">Live inventory and search coverage.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Live vendors" value={summary.liveTotal} />
        <StatTile label="Verified" value={summary.verifiedLive} />
        <StatTile label="Multi-business accounts" value={summary.multiBusinessAccounts} />
        <StatTile label="Live, no embedding" value={missingEmbeddingCount} />
      </div>

      {missingEmbeddingCount > 0 && (
        <p className="rounded-md border border-haldi/40 bg-haldi/10 px-4 py-3 text-sm text-ink/80">
          {missingEmbeddingCount} live vendor{missingEmbeddingCount !== 1 ? 's are' : ' is'} missing
          an embedding and won&rsquo;t appear in semantic search until the hourly cron backfills
          {missingEmbeddingCount !== 1 ? ' them' : ' it'}.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live vendors by category</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="py-6 text-center text-ink/50">No live vendors yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Live</TableHead>
                  <TableHead className="w-1/2">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(([cat, count]) => (
                  <TableRow key={cat}>
                    <TableCell className="font-medium">{cat}</TableCell>
                    <TableCell className="text-right tabular-nums">{count}</TableCell>
                    <TableCell>
                      <div className="h-4 w-full overflow-hidden rounded bg-ink/5">
                        <div
                          className="h-full rounded bg-indigo/70"
                          style={{ width: `${(count / maxCat) * 100}%` }}
                        />
                      </div>
                    </TableCell>
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
