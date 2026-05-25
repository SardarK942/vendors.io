import { createServerSupabaseClient } from '@/lib/supabase/server';
import { InboxRow, type InboxRowData } from './InboxRow';

interface InboxBlockProps {
  vendorProfileId: string;
}

export async function InboxBlock({ vendorProfileId }: InboxBlockProps) {
  const supabase = await createServerSupabaseClient();

  // "Needs your reply" — vendor must act.
  const { data: needsReply } = await supabase
    .from('bookings')
    .select(
      'id, status, couple_full_name, package_name_snapshot, event_type, created_at, updated_at, expires_at'
    )
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', ['pending', 'pending_quote', 'adjusted_quote_declined'])
    .order('created_at', { ascending: true });

  // "Closing soon" — accepted bookings whose deposit window expires within 24h.
  const in24h = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { data: closingSoon } = await supabase
    .from('bookings')
    .select(
      'id, status, couple_full_name, package_name_snapshot, created_at, updated_at, expires_at'
    )
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'accepted')
    .lt('expires_at', in24h)
    .order('expires_at', { ascending: true });

  // "Waiting on couple" — accepted (not closing soon) + adjusted_quote_sent.
  const { data: waiting } = await supabase
    .from('bookings')
    .select(
      'id, status, couple_full_name, package_name_snapshot, created_at, updated_at, expires_at'
    )
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', ['accepted', 'adjusted_quote_sent'])
    .order('updated_at', { ascending: false });

  const closingIds = new Set((closingSoon ?? []).map((r) => r.id));
  const waitingFiltered = (waiting ?? []).filter((r) => !closingIds.has(r.id));

  function packageLabel(r: {
    package_name_snapshot: string | null;
    status: string;
    event_type?: string | null;
  }): string {
    if (r.package_name_snapshot) return r.package_name_snapshot;
    if (r.status === 'pending_quote' && r.event_type) {
      return `Custom request · ${r.event_type}`;
    }
    return 'Booking';
  }

  const toRow = (
    r: {
      id: string;
      status: string;
      couple_full_name: string | null;
      package_name_snapshot: string | null;
      event_type?: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string | null;
    },
    opts?: { urgencyHours?: number; useUpdatedAt?: boolean }
  ): InboxRowData => ({
    bookingId: r.id,
    coupleName: r.couple_full_name ?? 'Couple',
    packageLabel: packageLabel(r),
    status: r.status,
    receivedAt: opts?.useUpdatedAt ? r.updated_at : r.created_at,
    urgencyHours: opts?.urgencyHours,
  });

  const replyRows: InboxRowData[] = [
    ...(needsReply ?? []).map((r) => toRow(r)),
    ...(closingSoon ?? []).map((r) => {
      const hoursLeft = r.expires_at
        ? Math.max(0, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 3600 / 1000))
        : 0;
      return toRow(r, { urgencyHours: hoursLeft });
    }),
  ];
  const waitingRows = waitingFiltered.map((r) => toRow(r, { useUpdatedAt: true }));

  const totalCount = replyRows.length + waitingRows.length;

  if (totalCount === 0) {
    return (
      <section className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No action needed. You&rsquo;ll see new requests here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Inbox</h2>

      {replyRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Needs your reply · {replyRows.length}
          </h3>
          {replyRows.map((r) => (
            <InboxRow key={r.bookingId} data={r} />
          ))}
        </div>
      )}

      {waitingRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Waiting on couple · {waitingRows.length}
          </h3>
          {waitingRows.map((r) => (
            <InboxRow key={r.bookingId} data={r} />
          ))}
        </div>
      )}
    </section>
  );
}
