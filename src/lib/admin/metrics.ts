const DAY_MS = 86_400_000;

export interface ProfileHealthRow {
  category: string | null;
  verified: boolean | null;
  user_id: string;
  onboarding_complete: boolean;
  is_active: boolean;
}

export interface MarketplaceSummary {
  /** Live = is_active AND onboarding_complete (the marketplace-visible gate). */
  liveTotal: number;
  byCategory: Record<string, number>;
  verifiedLive: number;
  /** Accounts owning more than one vendor profile (any status). */
  multiBusinessAccounts: number;
}

export function summarizeMarketplace(rows: ProfileHealthRow[]): MarketplaceSummary {
  const live = rows.filter((r) => r.is_active && r.onboarding_complete);

  const byCategory: Record<string, number> = {};
  for (const r of live) {
    const key = r.category ?? 'uncategorized';
    byCategory[key] = (byCategory[key] ?? 0) + 1;
  }

  const perUser = new Map<string, number>();
  for (const r of rows) perUser.set(r.user_id, (perUser.get(r.user_id) ?? 0) + 1);
  const multiBusinessAccounts = Array.from(perUser.values()).filter((n) => n > 1).length;

  return {
    liveTotal: live.length,
    byCategory,
    verifiedLive: live.filter((r) => r.verified).length,
    multiBusinessAccounts,
  };
}

export interface BookingSummaryRow {
  status: string;
  /** Deposit in cents (the 5% platform cut); null until paid. */
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  created_at: string;
}

export interface BookingsSummary {
  total: number;
  byStatus: Record<string, number>;
  paidCount: number;
  depositsCollectedCents: number;
  last7dCount: number;
}

export function summarizeBookings(rows: BookingSummaryRow[], nowMs: number): BookingsSummary {
  const byStatus: Record<string, number> = {};
  let paidCount = 0;
  let depositsCollectedCents = 0;
  let last7dCount = 0;

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.deposit_paid_at) {
      paidCount += 1;
      depositsCollectedCents += r.deposit_amount ?? 0;
    }
    if (nowMs - Date.parse(r.created_at) < 7 * DAY_MS) last7dCount += 1;
  }

  return { total: rows.length, byStatus, paidCount, depositsCollectedCents, last7dCount };
}
