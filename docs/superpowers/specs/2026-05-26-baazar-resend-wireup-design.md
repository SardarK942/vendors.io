# Baazar Resend Email Wire-up Design Spec

**Date:** 2026-05-26
**Component:** Audit + complete the Resend transactional email layer. Three new emails + brand-polished template helper + audit of existing 12.
**Status:** Approved direction; ready for implementation plan
**Branch:** `feat/baazar-resend-wireup`

---

## Goal

Close 3 real gaps in Baazar's transactional email layer and brand-polish the entire email surface so every inbox impression is consistent with the M+ design language:

1. **Add `sendCustomRequestReceivedEmail`** — wire into `POST /api/bookings/custom-request` so vendors receive an email when a couple submits a custom request (currently only an in-app notification fires).
2. **Wire orphan `sendBookingConfirmedEmail`** — fires in `payment.service.ts` on deposit_paid alongside (replacing for couples) the existing `sendDepositConfirmationEmail`. Couples get the richer version with vendor address + notes; vendors still get the generic deposit confirmation.
3. **Add `sendNewsletterWelcomeEmail`** — wire into `POST /api/newsletter/subscribe` so subscribers receive a brand-aware welcome email after signup.
4. **Extract `renderBrandedEmail()` template helper** — all 14+ emails (12 existing + 2 new + the orphan) share a single branded header/footer chrome with just the body slot varying. Inbox impressions are consistent.
5. **Audit the 12 existing email functions** — verify each is wired to the correct dispatch site, the context passed is current, and the copy isn't stale relative to the product flow. Any drift gets fixed in the same PR.

## Non-goals

- **Unsubscribe link / `/unsubscribe` route** — these are transactional emails (CAN-SPAM exempt). Newsletter welcome is technically marketing-adjacent but its only purpose is confirmation, and users can stop the list by emailing `hello@baazar.io` — we'll add a proper unsubscribe surface when we wire the actual newsletter SEND infrastructure (deferred to a future Resend marketing sub-project).
- **Per-user email preferences** — every user gets every transactional email Day 1. A "manage email preferences" page is a future sub-project (would need a new table or jsonb column for prefs).
- **Newsletter content sends** — the `newsletter_signups` table just collects emails. Sending an actual monthly newsletter is a separate sub-project (cron + audience export + Resend audience API).
- **Plain-text email fallback (explicit)** — Resend auto-generates plain-text from HTML. Day 1 we rely on that; future improvement is hand-tuned plain-text versions.
- **Email i18n / locale-aware copy** — single English version per email Day 1.
- **A/B variants of subject lines or copy** — no analytics infrastructure yet to drive testing.
- **Refactoring `notifications.service.ts` to auto-fire emails** — left as a follow-up. Day 1 keeps the current pattern: dispatch sites call both `notify*()` AND `send*Email()`. The audit will confirm both halves fire correctly.
- **Replacing the legacy `sendQuoteEmail` or `sendExpirationEmail`** — kept as-is for backward-compat with old flow paths. Not used in the current pipeline.

---

## Architecture

```
src/lib/email/
├── resend.ts                       # MODIFIED: keep sendEmail() dispatcher + all 14 send*() functions,
│                                   #           refactored to use renderBrandedEmail() for HTML body
├── render.ts                       # NEW: renderBrandedEmail(opts) → string
│                                   #      Produces the branded HTML shell (header + footer)
│                                   #      with `bodyHtml` slot for per-template content.
└── (no templates/ subdir Day 1)    # Bodies stay inline in resend.ts to minimize file count;
                                    # only the brand chrome is extracted. Templates can be
                                    # extracted into per-file modules later if any individual
                                    # body grows past ~50 lines.

src/__tests__/lib/email/
└── render.test.ts                  # NEW: unit tests for renderBrandedEmail() (structure,
                                    #      escape behavior, footer year correctness).
```

### Why no per-template files Day 1

Initially the spec considered extracting each email body to its own template file (e.g., `templates/booking-request.ts`). On reflection: the existing `resend.ts` is ~420 lines for 14 emails. Splitting adds 15 files for no real readability win — each body is 5-12 lines of inline HTML. Better: extract only the branded chrome (`renderBrandedEmail`) and keep bodies inline. If a body grows past ~50 lines (likely future event-detail or onboarding-confirm types), THEN extract that one.

### Component decomposition

| File                                           | Action     | Responsibility                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/email/render.ts`                      | **Create** | `renderBrandedEmail({ bodyHtml }) → string` — wraps body in the brand chrome (cream-soft header band with `baazar.` Spectral wordmark + hot-pink dot, hairline divider, 600px content block, ink-soft footer).                                     |
| `src/__tests__/lib/email/render.test.ts`       | **Create** | TDD tests: output contains body verbatim, footer has current year, escape behavior preserves user content.                                                                                                                                         |
| `src/lib/email/resend.ts`                      | **Modify** | (a) Refactor all 14 existing send\*Email() functions to use `renderBrandedEmail({ bodyHtml: '...' })` instead of building full HTML inline. (b) Add `sendCustomRequestReceivedEmail` + `sendNewsletterWelcomeEmail`.                               |
| `src/app/api/bookings/custom-request/route.ts` | **Modify** | After successful insert + `notifyCustomRequestReceived` call, also call `sendCustomRequestReceivedEmail(vendorEmail, ctx)`. Fire-and-forget (same pattern as existing notification dispatch).                                                      |
| `src/app/api/newsletter/subscribe/route.ts`    | **Modify** | After successful insert (or unique-violation idempotent path), call `sendNewsletterWelcomeEmail(email)`. Fire-and-forget. Email-domain is logged but the email itself is also sent.                                                                |
| `src/services/payment.service.ts`              | **Modify** | Lines ~203–206: replace the couple's `sendDepositConfirmationEmail(coupleEmail, ...)` call with `sendBookingConfirmedEmail(coupleEmail, vendorName, vendorFullAddress, vendorNotes, bookingId)`. Vendor still gets `sendDepositConfirmationEmail`. |
| `docs/AUDIT_EMAIL_WIRING.md`                   | **Create** | Audit document listing all 14 email functions, their dispatch sites, and the context fields passed. Any discrepancies found during the audit are listed with proposed fixes. Committed alongside the implementation.                               |
| `DESIGN.md`                                    | **Modify** | Add `transactional-email:` entry to `components:` block documenting the brand chrome + token usage.                                                                                                                                                |

---

## `renderBrandedEmail` template

```ts
export interface BrandedEmailOptions {
  /** Pre-rendered HTML body (already escaped where appropriate). Goes inside the content block. */
  bodyHtml: string;
}

export function renderBrandedEmail({ bodyHtml }: BrandedEmailOptions): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#FBF6EC;font-family:Helvetica,Arial,sans-serif;color:#1B1414;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FBF6EC;">
            <!-- Header -->
            <tr>
              <td style="background:#F4ECDC;padding:24px 32px;border-bottom:1px solid #E8DFC8;">
                <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1B1414;letter-spacing:-0.012em;">baazar<span style="color:#D1006C;">.</span></span>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;font-size:16px;line-height:1.55;color:#1B1414;">
                ${bodyHtml}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:24px 32px;border-top:1px solid #E8DFC8;font-size:12px;color:#5F5650;text-align:center;">
                &copy; ${year} Baazar Marketplace · Chicago, IL
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
```

### Why table-based layout

Email client rendering is medieval — Outlook still uses a Word-based renderer, Gmail strips `<style>` from `<head>`, Apple Mail respects most modern CSS but inconsistently. Table-based layout with **inline styles only** is the universally-supported pattern. No CSS variables, no `style` blocks, no media queries Day 1.

### Brand token usage in inline styles

Hardcoded hex values match DESIGN.md tokens — no CSS variables possible in email. Drift risk: if the palette ever updates, all email styles must be hand-updated. Tradeoff accepted for compatibility.

| Token               | Hex       | Usage                              |
| ------------------- | --------- | ---------------------------------- |
| `colors.cream`      | `#FBF6EC` | Page background + content block bg |
| `colors.cream-soft` | `#F4ECDC` | Header band bg                     |
| `colors.ink`        | `#1B1414` | Body text + headlines + CTA bg     |
| `colors.ink-soft`   | `#5F5650` | Footer text                        |
| `colors.hot-pink`   | `#D1006C` | Wordmark dot accent                |
| `colors.hairline`   | `#E8DFC8` | Header/footer dividers             |

Wordmark font: Georgia (Spectral fallback). Body font: Helvetica/Arial system fallback (Schibsted Grotesk isn't reliably available in email clients).

---

## Three new + 1 orphan-wire email touchpoints

### 1. `sendCustomRequestReceivedEmail` (NEW)

**Trigger:** `POST /api/bookings/custom-request/route.ts` after successful insert + `notifyCustomRequestReceived` call.

**Recipient:** Vendor (via `vendor.user.email` lookup — implementer must add the join since the existing route only has `vendor.user_id`).

**Function signature:**

```ts
export async function sendCustomRequestReceivedEmail(
  vendorEmail: string,
  ctx: {
    bookingId: string;
    coupleName: string; // for now: user.email since user.full_name isn't always populated
    eventDate: string; // ISO YYYY-MM-DD
    eventType: string; // 'mehndi' | 'sangeet' | etc.
    guestCount: number;
    descriptionPreview: string; // truncated to ~140 chars + ellipsis
  }
): Promise<boolean>;
```

**Body (inside `renderBrandedEmail`):**

```html
<h2
  style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;"
>
  New custom request
</h2>
<p style="margin:0 0 16px;">
  ${escapeHtml(ctx.coupleName)} sent you a custom request for
  <strong>${escapeHtml(ctx.eventDate)}</strong>.
</p>
<p style="margin:0 0 8px;"><strong>Event type:</strong> ${escapeHtml(ctx.eventType)}</p>
<p style="margin:0 0 8px;"><strong>Guest count:</strong> ${ctx.guestCount}</p>
<p style="margin:0 0 16px;color:#5F5650;font-style:italic;">
  "${escapeHtml(ctx.descriptionPreview)}"
</p>
<p style="margin:24px 0;">
  <a
    href="${appUrl()}/dashboard/bookings/${ctx.bookingId}"
    style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;"
    >Send a quote</a
  >
</p>
<p style="margin:0;color:#5F5650;font-size:13px;">
  Send a quote to lock it in. Couples typically expect a response within 72 hours.
</p>
```

### 2. `sendNewsletterWelcomeEmail` (NEW)

**Trigger:** `POST /api/newsletter/subscribe/route.ts` after successful insert OR idempotent unique-violation path.

**Recipient:** The subscriber email.

**Function signature:**

```ts
export async function sendNewsletterWelcomeEmail(email: string): Promise<boolean>;
```

**Body:**

```html
<h2
  style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;"
>
  Welcome to The Bazaar Letter
</h2>
<p style="margin:0 0 16px;">
  Thanks for subscribing. We send <strong>monthly</strong> — newly verified vendors, real Chicago
  wedding photos, and the occasional honest note. No noise.
</p>
<p style="margin:24px 0;">
  <a
    href="${appUrl()}/vendors"
    style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;"
    >Browse vendors</a
  >
</p>
<p style="margin:0;color:#5F5650;font-size:13px;">
  If this wasn't you, ignore this email — you won't hear from us again.
</p>
```

### 3. `sendBookingConfirmedEmail` (ORPHAN → WIRE)

Already exists in `src/lib/email/resend.ts:271`. Currently has 0 callsites.

**Required change:** In `src/services/payment.service.ts` lines 203–206, replace the couple's `sendDepositConfirmationEmail` call with `sendBookingConfirmedEmail` (vendor still gets `sendDepositConfirmationEmail` with `isVendor=true`).

Current state:

```ts
await sendDepositConfirmationEmail(coupleEmail, vp.business_name, amount, false); // couple
await sendDepositConfirmationEmail(vendorUser.email, vp.business_name, amount, true); // vendor
```

After:

```ts
// Couple gets the richer confirmation with vendor address + notes (revealed on deposit_paid).
await sendBookingConfirmedEmail(
  coupleEmail,
  vp.business_name,
  vendorFullAddress,
  vendorNotes,
  bookingId
);
// Vendor still gets the generic deposit confirmation.
await sendDepositConfirmationEmail(vendorUser.email, vp.business_name, amount, true);
```

The `vendorFullAddress` + `vendorNotes` + `bookingId` need to be resolved at the call site — likely already in scope since the deposit_paid event has all of these. Implementer verifies during Task 4.

### 4. (Architectural reminder) All 12 existing emails re-templated through `renderBrandedEmail`

Each existing `send*Email()` function in `resend.ts` is refactored from:

```ts
return sendEmail({
  to: ...,
  subject: ...,
  html: `<h2>Title</h2><p>Body</p>...${FOOTER}`,  // old: inline full HTML
});
```

To:

```ts
return sendEmail({
  to: ...,
  subject: ...,
  html: renderBrandedEmail({ bodyHtml: `<h2>...</h2><p>...</p>` }),  // new: just body
});
```

The 12 existing functions are mechanical refactors. Their CTAs gain ink+cream button styling in the process.

---

## Audit of existing 12 emails

The audit produces `docs/AUDIT_EMAIL_WIRING.md` with this shape:

```markdown
# Email Wiring Audit — 2026-05-26

For each of the 14 email functions in src/lib/email/resend.ts:

- Function name
- Dispatch site (file:line)
- Context fields passed
- Status: ✅ correct / 🟡 stale copy / ❌ broken wiring
- Action: none / copy update / dispatch fix

## sendBookingRequestEmail

- Dispatch: src/.../route.ts:NN
- Context: { vendorEmail, vendorName, bookingId }
- Status: ✅
- Action: none

## sendBookingReceiptEmail

- Dispatch: ...
  [etc.]
```

Audit pass tasks:

1. **Identify each dispatch site** via `grep -rn "send{FunctionName}" src/` for each of the 12 functions
2. **Read the call context** to confirm the args match the function signature + the call timing is correct
3. **Compare email copy** to the current product state (e.g., does the deposit % match what payment.service.ts actually does? does the response window match `expires_at` logic?)
4. **Fix any drift** in the same PR if trivial (copy edits); flag larger issues in the audit doc for follow-up

Audit findings will be listed in the PR description. Major fixes (e.g., a function calling the wrong helper, a context field that's been renamed) ship as inline commits in this PR. Minor copy nits (a stale "30%" → "10%" deposit reference) ship as the same.

---

## Test plan

### Unit tests

- **`render.test.ts`** (NEW): structure tests + footer-year correctness + escape behavior
- No new tests for each `send*Email()` — they're all wrapper functions over `sendEmail` which is mocked-out in existing test patterns. The audit confirms wiring via grep + read, not via test changes.

### Integration tests

- **Existing API tests stay green** — `src/__tests__/api/bookings-custom-request.test.ts` and `src/__tests__/api/newsletter-subscribe.test.ts` should pick up the new email-send call. The send is fire-and-forget so test assertions probably don't need updating, but if they assert on side-effect mock calls, add the new `sendCustomRequestReceivedEmail` and `sendNewsletterWelcomeEmail` to the mocks.

### Manual visual verification

Resend's dashboard "Send test email" feature: implementer triggers each of the 14+ emails to their own Gmail/Apple Mail inbox and confirms:

- Brand header renders consistently
- CTA button looks like a button (some clients break links into plain blue text)
- Footer year is current
- No broken/extra whitespace
- Subject line reads cleanly in the inbox preview

Document any client-specific rendering issues in the audit doc. Major issues block the PR; cosmetic ones land as follow-up.

---

## Out of scope (deferred follow-ups)

- **`/unsubscribe` route + per-user email preferences** — implies a `users.email_preferences` jsonb column + an unsubscribe page + token-based unsubscribe links. Sub-project's worth on its own.
- **Newsletter SEND infrastructure** — when we actually start sending monthly newsletters, we need: cron schedule, content management, Resend audience API integration, segmentation. Day 1 only confirms the subscription.
- **Plain-text email fallback (explicit)** — Resend's auto-generation is acceptable Day 1.
- **Hand-tuned subject lines / preheaders** — Day 1 uses straightforward subjects. Preheader (inbox preview text after subject) is auto-generated from first paragraph; we can hand-tune in a future iteration.
- **Architectural refactor of `notifications.service.ts`** — making each notification helper auto-fire its email is the right long-term move but is deferred. Day 1 keeps both calls explicit at dispatch sites.
- **i18n / locale-aware copy** — single English version per email.
- **Per-email analytics** — open/click rates via Resend's webhooks. Useful but adds infra not justified Day 1.
- **Branded email per locale (RTL for Arabic/Persian etc.)** — future, when we have locale-aware product surfaces.

---

## Open questions

None blocking. Implementer should verify during Task 1:

1. The exact line numbers in `payment.service.ts` where `sendDepositConfirmationEmail` is called (the spec says ~203–206; may have shifted).
2. Whether `vendorFullAddress` and `vendorNotes` are in scope at that call site, or need to be fetched.
3. Whether `sendReviewRequestEmail` is actually wired to a real dispatch site (the grep showed 1 callsite; verify it fires on event_completed or similar).
