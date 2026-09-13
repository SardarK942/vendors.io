import type { Database } from '@/types/database.types';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExportButtons } from '@/components/admin/ExportButtons';
import { buildUnfinishedRow, emailList, type UnfinishedRow } from '@/lib/admin/unfinished-profiles';
import { toCsv } from '@/lib/admin/csv';

// Admin aggregates read across all users, so this must never be statically
// cached — always reflect the live DB.
export const dynamic = 'force-dynamic';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

const GATE_FIELDS =
  'id, business_name, category, bio, instagram_handle, portfolio_images, languages, years_in_business, response_sla_hours, created_at, updated_at, user_id';

export default async function AdminOverviewPage() {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from('vendor_profiles')
    .select(`${GATE_FIELDS}, users!user_id(email)`)
    .eq('onboarding_complete', false);

  const now = Date.now();
  const rows: UnfinishedRow[] = (data ?? [])
    .map((r) => {
      const userRel = (r as { users?: { email?: string } | { email?: string }[] }).users;
      const email = (Array.isArray(userRel) ? userRel[0]?.email : userRel?.email) ?? '';
      return buildUnfinishedRow(r as unknown as VendorRow, email, now);
    })
    .sort((a, b) => b.daysStalled - a.daysStalled);

  const total = rows.length;
  const avgCompleteness = total
    ? Math.round(rows.reduce((sum, r) => sum + r.completeness, 0) / total)
    : 0;
  const stalledOverWeek = rows.filter((r) => r.daysStalled > 7).length;
  const noPhotos = rows.filter((r) => r.missingFields.includes('portfolio_images')).length;

  const csv = toCsv(
    ['Business', 'Email', 'Created', 'Days stalled', 'Completeness %', 'Missing fields'],
    rows.map((r) => [
      r.businessName,
      r.email,
      r.createdAt ? r.createdAt.slice(0, 10) : '',
      r.daysStalled,
      r.completeness,
      r.missingFields.join('; '),
    ])
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unfinished profiles</h1>
        <p className="text-ink/60">
          Vendors who started onboarding but never published. Export or copy their emails for
          follow-up.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Unfinished profiles" value={total} />
        <StatTile label="Avg. completeness" value={`${avgCompleteness}%`} />
        <StatTile label="Stalled > 7 days" value={stalledOverWeek} />
        <StatTile label="Missing photos" value={noPhotos} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">
            {total} vendor{total !== 1 ? 's' : ''} to follow up
          </CardTitle>
          <ExportButtons csv={csv} emails={emailList(rows)} filename="unfinished-profiles" />
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="py-8 text-center text-ink/50">
              No unfinished profiles — everyone who started has published. 🎉
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Days stalled</TableHead>
                  <TableHead className="text-right">Complete</TableHead>
                  <TableHead>Still missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.profileId}>
                    <TableCell className="font-medium">{r.businessName || '—'}</TableCell>
                    <TableCell className="text-ink/70">{r.email || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.daysStalled}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.completeness}%</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.missingFields.map((f) => (
                          <Badge key={f} variant="secondary" className="font-normal">
                            {f}
                          </Badge>
                        ))}
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

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-sm text-ink/60">{label}</div>
      </CardContent>
    </Card>
  );
}
