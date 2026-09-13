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
import { ExportButtons } from '@/components/admin/ExportButtons';
import { loadVendorLifecycle } from '@/lib/admin/vendor-lifecycle';
import {
  computeOnboardingFunnel,
  accountAgeDays,
  unconfirmedVendors,
  abandonedVendors,
} from '@/lib/admin/onboarding-funnel';
import { toCsv } from '@/lib/admin/csv';
import { emailList } from '@/lib/admin/unfinished-profiles';
import type { NudgeUser } from '@/lib/onboarding/nudge-candidates';

export const dynamic = 'force-dynamic';

const fmtDate = (ts: string | null) => (ts ? ts.slice(0, 10) : '—');

export default async function AdminOnboardingPage() {
  const supabase = createServiceRoleClient();
  const { users, live, started } = await loadVendorLifecycle(supabase);
  const now = Date.now();

  const funnel = computeOnboardingFunnel(
    users.map((u) => ({ id: u.id, confirmed: u.confirmed })),
    started,
    live
  );
  const topCount = funnel[0]?.count || 1;

  const unconfirmed = unconfirmedVendors(users);
  const abandoned = abandonedVendors(users, live);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarding funnel</h1>
        <p className="text-ink/60">
          Where vendors drop off between signing up and going live, and the follow-up cohorts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {funnel.map((stage) => (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-sm text-ink/70">{stage.label}</div>
              <div className="h-7 flex-1 overflow-hidden rounded bg-ink/5">
                <div
                  className="flex h-full items-center rounded bg-indigo/80 px-2 text-xs font-medium text-white"
                  style={{
                    width: `${Math.max((stage.count / topCount) * 100, stage.count ? 6 : 0)}%`,
                  }}
                >
                  {stage.count > 0 ? stage.count : ''}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-sm tabular-nums text-ink/60">
                {stage.pct}%
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <CohortCard
        title="Unconfirmed vendors"
        description="Signed up as a vendor but never confirmed their email."
        users={unconfirmed}
        now={now}
        nudgeLabel="Confirm nudge sent"
        nudgeValue={(u) => fmtDate(u.confirm_nudge_sent_at)}
        filename="unconfirmed-vendors"
      />

      <CohortCard
        title="Abandoned onboarding"
        description="Confirmed their email but never published a profile."
        users={abandoned}
        now={now}
        nudgeLabel="Last nudge"
        nudgeValue={(u) => fmtDate(u.onboarding_nudge_7d_sent_at ?? u.onboarding_nudge_24h_sent_at)}
        filename="abandoned-onboarding"
      />
    </div>
  );
}

function CohortCard({
  title,
  description,
  users,
  now,
  nudgeLabel,
  nudgeValue,
  filename,
}: {
  title: string;
  description: string;
  users: NudgeUser[];
  now: number;
  nudgeLabel: string;
  nudgeValue: (u: NudgeUser) => string;
  filename: string;
}) {
  const csv = toCsv(
    ['Email', 'Name', 'Age (days)', nudgeLabel],
    users.map((u) => [
      u.email ?? '',
      u.full_name ?? '',
      accountAgeDays(u.created_at, now),
      nudgeValue(u),
    ])
  );
  const emails = emailList(users.map((u) => ({ email: u.email ?? '' })));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">
            {title} <span className="text-ink/40">({users.length})</span>
          </CardTitle>
          <p className="mt-0.5 text-sm text-ink/60">{description}</p>
        </div>
        <ExportButtons csv={csv} emails={emails} filename={filename} />
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="py-6 text-center text-ink/50">None right now.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Age (days)</TableHead>
                <TableHead>{nudgeLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-ink/80">{u.email ?? '—'}</TableCell>
                  <TableCell>{u.full_name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {accountAgeDays(u.created_at, now)}
                  </TableCell>
                  <TableCell className="text-ink/60">{nudgeValue(u)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
