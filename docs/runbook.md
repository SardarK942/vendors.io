# vendors.io production runbook

The "something is on fire at 2am, what do I do" guide. Keep entries short.
When you fix an incident, add a row to the log at the bottom so future-you
knows you've seen that failure shape before.

---

## Quick links

| Thing            | Where                                                       |
| ---------------- | ----------------------------------------------------------- |
| Vercel project   | https://vercel.com/sardark942s-projects/vendors-io          |
| Supabase (prod)  | https://supabase.com/dashboard/project/obpdgihdskbxzgyctaib |
| Supabase (dev)   | https://supabase.com/dashboard/project/lquvhjedlzubqusnfaak |
| Stripe dashboard | https://dashboard.stripe.com                                |
| Resend dashboard | https://resend.com/emails                                   |
| Sentry           | https://sentry.io (once set up — Phase H1)                  |
| Upstash          | https://console.upstash.com (once set up — Phase H2)        |
| GitHub repo      | https://github.com/SardarK942/vendors.io                    |
| Health endpoint  | `<base-url>/api/health`                                     |

---

## First response (any incident)

1. **Hit the health endpoint** — tells you instantly if Supabase or Stripe is the broken dep:
   ```
   curl https://<base-url>/api/health
   ```
2. **Check Vercel function logs** — search for `level":"error"` in the last 30 min. Our logger emits JSON-per-line.
3. **Check Sentry** (once wired) — errors group by fingerprint, so recurring issues are visible at a glance.
4. **Check `stripe_events` + `cron_runs` tables** for webhook / cron failures:

   ```sql
   select event_type, error, received_at
   from stripe_events
   where handled_at is null or error is not null
   order by received_at desc
   limit 20;

   select job, error, started_at
   from cron_runs
   order by started_at desc
   limit 10;
   ```

---

## Playbooks

### 1. Webhook failing — Stripe events aren't being handled

**Symptoms:** Payments succeed on Stripe dashboard but bookings stay in `quoted` / transactions never flip to `earned`.

1. Open **Stripe → Developers → Webhooks** → your endpoint. Look at recent deliveries. Any 4xx/5xx?
2. If signature errors: `STRIPE_WEBHOOK_SECRET` on Vercel doesn't match the endpoint's secret. Copy the `whsec_...` from Stripe → paste into Vercel env → redeploy.
3. If 500s: check Vercel logs for the route — the audit row in `stripe_events.error` will also have the Postgres error.
4. If webhook URL is wrong: Stripe endpoint must be `https://<base-url>/api/webhooks/stripe`. No trailing slash.
5. Replay missed events: Stripe dashboard → event → **Resend**.

### 2. Cron not running — auto-complete / auto-expire not firing

**Symptoms:** `booking_requests` rows stay in `pending` past 72h or `deposit_paid` past `event_date + 48h`.

1. Check `cron_runs`:
   ```sql
   select * from cron_runs order by started_at desc limit 5;
   ```
   If the last row is > 25h old, cron isn't firing.
2. Vercel → project → **Settings → Cron Jobs**. Confirm the schedule exists. Hobby plan only allows **once per day** (`0 9 * * *`).
3. If cron fires but 401s, `CRON_SECRET` env var is wrong or missing. Regenerate with `openssl rand -hex 32`, update Vercel env + redeploy, confirm `vercel.json` sends the `Authorization: Bearer <secret>` header.
4. Manual trigger (if you need it now):
   ```
   curl -X POST https://<base-url>/api/cron/tick \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

### 3. Withdraw failing — `balance_insufficient` from Stripe

**Symptoms:** Vendor clicks withdraw → gets an error, `initiatePayout` throws.

1. Expected in test mode shortly after a payment — Stripe funds need time to settle.
2. In live mode, this means a charge the transfer is sourced from hasn't cleared. `source_transaction` pattern is per-transaction, so check which transaction triggered this by looking at Vercel logs.
3. Confirm the vendor's `stripe_accounts.charges_enabled = true AND payouts_enabled = true AND frozen_reason IS NULL`. A freeze would also block this.

### 4. Refund issued but vendor still shows pending money

**Symptoms:** Couple cancelled, refund fired on Stripe, but `transactions.refund_amount_cents` is still 0.

1. The webhook (`charge.refunded`) is the single writer for refund fields. Check `stripe_events` — was the event delivered?
2. If not, resend from Stripe dashboard.
3. If delivered but errored, inspect `stripe_events.error`. Likely a schema mismatch or a missing `stripe_transfer_id` on a pre-payout refund.

### 5. Supabase returning empty queries in prod but not local

**Symptoms:** Dashboard shows "0 bookings" but rows exist in the table editor.

1. 99% of the time: the anon key on Vercel belongs to a different Supabase project. New-format keys have prefixes `sb_publishable_<fingerprint>...`; different projects have different fingerprints.
2. Go to Supabase → Settings → API for the **prod** project → copy the **anon** key → paste into Vercel env `NEXT_PUBLIC_SUPABASE_ANON_KEY` → redeploy.
3. Do the same for `SUPABASE_SERVICE_ROLE_KEY` if writes are also failing.

### 6. Rate-limit 429s from legitimate users

**Symptoms:** A user complains they can't submit a booking; Vercel logs show 429 on `/api/bookings/request`.

1. Check their identifier (`u:<uuid>`). Upstash dashboard → data browser → key `rl:booking:create:u:<uuid>:...`.
2. If they hit the limit legitimately (e.g., batch imported), clear the key or wait out the window.
3. If a shared IP is being punished, consider bumping the `limit` in `src/lib/rate-limit.ts` callsite. Don't lower — lower means more false positives.

### 7. Dispute came in — need to resolve

1. Booking is in `disputed` state. Cron skips it — it will never auto-complete.
2. Contact both parties (couple + vendor emails on the booking + users rows).
3. Decide:
   - **Complete the booking** → service role update status to `completed`, set `completed_at`. Trigger flips transactions to `earned`.
   - **Refund + cancel** → service role update to `couple_cancelled`, then fire a Stripe refund manually from the dashboard and let `handleChargeRefunded` do its thing.
4. Never edit transactions directly — let the webhook drive it.

---

## Common SQL snippets

```sql
-- find a user by email
select id, role, created_at from users where email ilike '%<partial>%';

-- list active bookings for a vendor
select id, status, event_date, vendor_quote_amount, created_at
from booking_requests
where vendor_profile_id = '<uuid>'
  and status not in ('completed', 'expired', 'couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'rejected')
order by event_date;

-- stuck in quoted past 72h (shouldn't exist after cron runs)
select id, created_at, expires_at, status
from booking_requests
where status = 'pending' and expires_at < now()
order by expires_at;

-- transactions ready for payout
select t.id, t.vendor_payout, t.booking_request_id, br.event_date
from transactions t
join booking_requests br on br.id = t.booking_request_id
where t.status = 'earned' and t.transferred_at is null
order by br.event_date;

-- vendor's full money picture
select
  (select coalesce(sum(vendor_payout), 0) from transactions
     where booking_request_id in (select id from booking_requests where vendor_profile_id = '<uuid>')
     and status in ('authorized', 'recognized')) as pending_escrow,
  (select coalesce(sum(vendor_payout), 0) from transactions
     where booking_request_id in (select id from booking_requests where vendor_profile_id = '<uuid>')
     and status = 'earned' and transferred_at is null) as available,
  (select coalesce(sum(vendor_payout), 0) from transactions
     where booking_request_id in (select id from booking_requests where vendor_profile_id = '<uuid>')
     and transferred_at is not null) as transferred;
```

---

## Deployment

- **Preview:** every push to a non-main branch → automatic preview deploy.
- **Prod:** merge PR to `main` → automatic prod deploy. Pre-flight: `npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build`.
- **Env-var changes require a redeploy.** Vercel caches the built bundle and the env is baked in at build time (specifically `NEXT_PUBLIC_*`).
- **Rollback:** Vercel → Deployments → click an earlier prod deploy → **Promote to Production**. Database migrations don't roll back automatically; write a down-migration.

---

## Incident log

Add an entry any time something breaks in prod.

```
## YYYY-MM-DD — <short title>
- What broke:
- First signal:
- Root cause:
- Fix:
- Prevent next time:
```
