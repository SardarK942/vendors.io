# Baazar Resend Email Wire-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement [the Resend wire-up spec](../specs/2026-05-26-baazar-resend-wireup-design.md) — extract `renderBrandedEmail()` helper, refactor all 14 existing email functions to use it, add 2 new emails (`sendCustomRequestReceivedEmail`, `sendNewsletterWelcomeEmail`), wire the orphan `sendBookingConfirmedEmail` into the deposit-paid flow, audit dispatch sites for the 12 already-wired emails, ship inline fixes + an audit doc.

**Architecture:** New `src/lib/email/render.ts` exports `renderBrandedEmail({ bodyHtml }) → string` with M+ branded chrome (cream header band + Spectral wordmark + hot-pink dot + hairline + 600px content + ink-soft footer). All `send*Email()` functions refactor to pass body to that helper. Two new functions added for custom-request + newsletter welcome. Orphan wired into `payment.service.ts` deposit_paid flow (replacing the couple-side `sendDepositConfirmationEmail`; vendor still gets generic deposit confirmation). Audit produces `docs/AUDIT_EMAIL_WIRING.md` listing all 14 functions, dispatch sites, context fields, and status. Inline fixes for any trivial drift land in the same PR.

**Tech Stack:** Next.js 14 App Router · TypeScript · vitest. Existing Resend SDK already installed (`resend` package). No new deps.

**Branch:** `feat/baazar-resend-wireup` (already created, spec committed at `0625b24`).

**Out of scope (deferred):** `/unsubscribe` route + per-user email preferences, newsletter SEND infrastructure, explicit plain-text fallback (Resend auto-generates), email i18n, A/B variants, refactoring `notifications.service.ts` to auto-fire emails.

---

## File Structure

| File                                                | Action     | Responsibility                                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/email/render.ts`                           | **Create** | `renderBrandedEmail({ bodyHtml }) → string`. M+-branded HTML shell (cream + Spectral wordmark header + hot-pink dot + content area + ink-soft footer).                                                                                   |
| `src/__tests__/lib/email/render.test.ts`            | **Create** | TDD tests: output contains body verbatim, footer year is current, header markup intact, no XSS-style escaping of body (body is trusted input — sender controls it).                                                                      |
| `src/lib/email/resend.ts`                           | **Modify** | (a) Add `import { renderBrandedEmail } from './render'`. (b) Refactor all 14 existing send\*Email() functions to use `renderBrandedEmail({ bodyHtml: '...' })`. (c) Add `sendCustomRequestReceivedEmail` + `sendNewsletterWelcomeEmail`. |
| `src/app/api/bookings/custom-request/route.ts`      | **Modify** | After successful insert + `notifyCustomRequestReceived` call, also call `sendCustomRequestReceivedEmail(vendorEmail, ctx)`. Fetch vendor user.email by extending the existing select.                                                    |
| `src/__tests__/api/bookings-custom-request.test.ts` | **Modify** | Add `vi.mock('@/lib/email/resend')` for the new function; assert it's called on success path.                                                                                                                                            |
| `src/app/api/newsletter/subscribe/route.ts`         | **Modify** | After successful insert (or unique-violation idempotent path), call `sendNewsletterWelcomeEmail(email)`. Fire-and-forget.                                                                                                                |
| `src/__tests__/api/newsletter-subscribe.test.ts`    | **Modify** | Add `vi.mock` for the new function; assert it's called on success path.                                                                                                                                                                  |
| `src/services/payment.service.ts`                   | **Modify** | Lines ~188–206: expand the deposit-paid select to include vendor address + booking.vendor_notes. Replace couple-side `sendDepositConfirmationEmail` with `sendBookingConfirmedEmail`.                                                    |
| `docs/AUDIT_EMAIL_WIRING.md`                        | **Create** | Audit doc listing all 14 email functions, dispatch sites, context, status. Inline fixes documented.                                                                                                                                      |
| `DESIGN.md`                                         | **Modify** | Add `transactional-email:` entry to `components:` block.                                                                                                                                                                                 |

---

## Task 1: `renderBrandedEmail` helper + tests (TDD)

**Files:**

- Create: `src/lib/email/render.ts`
- Create: `src/__tests__/lib/email/render.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/email/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderBrandedEmail } from '@/lib/email/render';

describe('renderBrandedEmail', () => {
  it('returns a full HTML document', () => {
    const html = renderBrandedEmail({ bodyHtml: '<p>Test</p>' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('embeds the body verbatim', () => {
    const html = renderBrandedEmail({ bodyHtml: '<h2>Hi</h2><p>Body content</p>' });
    expect(html).toContain('<h2>Hi</h2>');
    expect(html).toContain('<p>Body content</p>');
  });

  it('includes the baazar wordmark in the header', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    expect(html).toContain('baazar');
    // Hot-pink dot accent
    expect(html).toContain('#D1006C');
  });

  it('renders the current year in the footer', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    const year = new Date().getFullYear();
    expect(html).toContain(`${year} Baazar Marketplace`);
  });

  it('uses the cream page background', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    expect(html).toContain('#FBF6EC');
  });

  it('caps content at 600px max-width', () => {
    const html = renderBrandedEmail({ bodyHtml: '' });
    expect(html).toContain('max-width:600px');
  });

  it('does not escape the body (caller controls escaping)', () => {
    // The body is trusted (constructed by send*Email functions that escape user input)
    const html = renderBrandedEmail({ bodyHtml: '<a href="/x">link</a>' });
    expect(html).toContain('<a href="/x">link</a>');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- src/__tests__/lib/email/render.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/email/render'`.

- [ ] **Step 3: Write the helper**

Write to `src/lib/email/render.ts`:

```ts
/**
 * Branded email chrome shared by every transactional + marketing email.
 * Wraps a body slot in M+-token-colored cream header band + Spectral-fallback
 * wordmark + hot-pink dot accent + hairline divider + 600px content block +
 * ink-soft footer with current year.
 *
 * All styles inlined because email clients (Outlook especially) drop <style>
 * blocks and any modern CSS. Table-based layout for the same reason.
 *
 * @see docs/superpowers/specs/2026-05-26-baazar-resend-wireup-design.md
 */

export interface BrandedEmailOptions {
  /** Pre-rendered HTML body. The caller is responsible for escaping any user
   * input. Goes into the content block, between header and footer. */
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
            <tr>
              <td style="background:#F4ECDC;padding:24px 32px;border-bottom:1px solid #E8DFC8;">
                <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1B1414;letter-spacing:-0.012em;">baazar<span style="color:#D1006C;">.</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:16px;line-height:1.55;color:#1B1414;">
                ${bodyHtml}
              </td>
            </tr>
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

- [ ] **Step 4: Run to verify passing**

```bash
npm test -- src/__tests__/lib/email/render.test.ts
```

Expected: 7/7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/render.ts src/__tests__/lib/email/render.test.ts
git commit -m "feat(email): renderBrandedEmail M+ template helper"
```

---

## Task 2: Refactor 14 existing emails to use `renderBrandedEmail`

**Files:**

- Modify: `src/lib/email/resend.ts`

This is a mechanical refactor. Each `send*Email()` currently builds full HTML inline (with `${FOOTER}` constant); we replace with `renderBrandedEmail({ bodyHtml: '...just-body-html...' })`.

The `FOOTER` constant + manual `<h2>` styling currently exists; both go away because `renderBrandedEmail` handles them.

- [ ] **Step 1: Add the import + remove old constants**

Read `src/lib/email/resend.ts`. At the top, add:

```ts
import { renderBrandedEmail } from './render';
```

Remove (or leave dead — your call; prefer remove):

```ts
const FOOTER = '<p style="color:#888;font-size:12px;">— Baazar.io</p>';
```

The `escapeHtml`, `fmtUsd`, `appUrl`, `sendEmail` helpers stay.

- [ ] **Step 2: Refactor each `send*Email()` body**

For each of the 14 functions, replace the `html:` template-literal contents with a call to `renderBrandedEmail`. Pattern:

**Before:**

```ts
return sendEmail({
  to: vendorEmail,
  subject: 'New Booking Request',
  html: `
    <h2>New Booking Request</h2>
    <p>Hi ${escapeHtml(vendorName)},</p>
    <p>You have a new booking request for one of your packages. Review it within 72 hours — accept at the package price or send an adjusted quote.</p>
    <p><a href="${appUrl()}/dashboard/bookings/${bookingId}">View Request</a></p>
    ${FOOTER}
  `,
});
```

**After:**

```ts
return sendEmail({
  to: vendorEmail,
  subject: 'New Booking Request',
  html: renderBrandedEmail({
    bodyHtml: `
      <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">New booking request</h2>
      <p style="margin:0 0 16px;">Hi ${escapeHtml(vendorName)},</p>
      <p style="margin:0 0 16px;">You have a new booking request for one of your packages. Review it within 72 hours — accept at the package price or send an adjusted quote.</p>
      <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">View request</a></p>
    `,
  }),
});
```

Notes on the pattern:

- `<h2>` gets inline styling for Spectral-fallback + ink color
- `<a>` becomes a button: ink bg + cream text + 6px radius + 12/24 padding
- `${FOOTER}` removed (handled by `renderBrandedEmail`)
- Subject line stays the same
- Subject case-normalize: "Adjusted quote received" → "Adjusted quote received" (sentence case, no Title Case)

Apply this pattern to all 14 functions:

| Function                          | Subject                                                          | Body slot                                        |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `sendBookingRequestEmail`         | "New booking request"                                            | h2 + greeting + 72h window message + button      |
| `sendBookingReceiptEmail`         | "Booking request sent"                                           | h2 + status message + button                     |
| `sendQuoteEmail` (legacy)         | `Quote received from ${vendorName}`                              | h2 + quote amount strong + button                |
| `sendVendorAcceptedEmail`         | `${vendorName} accepted your booking`                            | h2 + total + pay-deposit message + button        |
| `sendAdjustedQuoteEmail`          | `${vendorName} sent an adjusted quote`                           | h2 + new total + reason + button                 |
| `sendCoupleAcceptedAdjustedEmail` | `${coupleName} accepted your adjusted quote`                     | h2 + total + status + button                     |
| `sendCoupleDeclinedEmail`         | "Couple declined your adjusted quote"                            | h2 + 72h re-quote window + button                |
| `sendDepositConfirmationEmail`    | `Deposit ${isVendor ? 'received' : 'confirmed'} — ${vendorName}` | h2 + amount + isVendor-conditional body + button |
| `sendBookingConfirmedEmail`       | `Booking confirmed — ${vendorName}`                              | h2 + address + vendor notes + button             |
| `sendBookingAutoCancelEmail`      | "Booking auto-cancelled"                                         | h2 + reason + button                             |
| `sendExpirationEmail` (legacy)    | `Booking request expired — ${vendorName}`                        | h2 + isVendor-conditional body + button          |
| `sendCompletionEmailToVendor`     | `Funds unlocked — ${fmtUsd(amount)} available`                   | h2 + amount + button                             |
| `sendReviewRequestEmail`          | `How was ${vendorName}?`                                         | h2 + thanks + button                             |
| `sendCancellationEmail`           | `Booking cancelled — ${vendorName}`                              | h2 + actor + reason + refund line + button       |

For each, the BODY slot uses these inline-style patterns:

```
<h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">{title}</h2>
<p style="margin:0 0 16px;">{paragraph}</p>
<p style="margin:24px 0;"><a href="{url}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">{button label}</a></p>
<p style="margin:0;color:#5F5650;font-size:13px;">{optional smaller note}</p>
```

Helper labels:

- For warnings/cautions: `color:#B81628;` (error red)
- For italic emphasis: `font-style:italic;color:#5F5650;`

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Spot-check one function visually**

Open the refactored file. Pick `sendBookingRequestEmail`. Confirm:

- No `${FOOTER}` reference remains
- `renderBrandedEmail({ bodyHtml: ... })` wraps the inline HTML
- Subject line preserved
- All `escapeHtml(...)` calls preserved
- `appUrl()` preserved

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "refactor(email): all 14 send*Email use renderBrandedEmail"
```

---

## Task 3: Add `sendCustomRequestReceivedEmail`

**Files:**

- Modify: `src/lib/email/resend.ts`

- [ ] **Step 1: Add the new function**

In `src/lib/email/resend.ts`, after `sendCancellationEmail` (or alphabetically — your call), add:

```ts
/**
 * Fired when a couple submits a custom-request booking (status='pending_quote').
 * Recipient: vendor.
 *
 * Includes a preview of the couple's description (truncated to ~140 chars)
 * so the vendor can scan the request in the inbox preview.
 */
export async function sendCustomRequestReceivedEmail(
  vendorEmail: string,
  ctx: {
    bookingId: string;
    coupleName: string;
    eventDate: string;
    eventType: string;
    guestCount: number;
    descriptionPreview: string;
  }
): Promise<boolean> {
  const safeCouple = escapeHtml(ctx.coupleName);
  const safeDate = escapeHtml(ctx.eventDate);
  const safeType = escapeHtml(ctx.eventType);
  const safeDesc = escapeHtml(ctx.descriptionPreview);

  return sendEmail({
    to: vendorEmail,
    subject: 'New custom request',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">New custom request</h2>
        <p style="margin:0 0 16px;">${safeCouple} sent you a custom request for <strong>${safeDate}</strong>.</p>
        <p style="margin:0 0 8px;"><strong>Event type:</strong> ${safeType}</p>
        <p style="margin:0 0 8px;"><strong>Guest count:</strong> ${ctx.guestCount}</p>
        <p style="margin:0 0 16px;color:#5F5650;font-style:italic;">"${safeDesc}"</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/dashboard/bookings/${ctx.bookingId}" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Send a quote</a></p>
        <p style="margin:0;color:#5F5650;font-size:13px;">Send a quote to lock it in. Couples typically expect a response within 72 hours.</p>
      `,
    }),
  });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): sendCustomRequestReceivedEmail"
```

---

## Task 4: Wire `sendCustomRequestReceivedEmail` into custom-request route

**Files:**

- Modify: `src/app/api/bookings/custom-request/route.ts`
- Modify: `src/__tests__/api/bookings-custom-request.test.ts`

- [ ] **Step 1: Update the test mock + add assertion**

Read `src/__tests__/api/bookings-custom-request.test.ts`. Find the top mock block and add `sendCustomRequestReceivedEmail` to the resend mock:

```ts
vi.mock('@/lib/email/resend', () => ({
  sendCustomRequestReceivedEmail: vi.fn().mockResolvedValue(true),
}));
```

(If a `vi.mock('@/lib/email/resend', ...)` block doesn't already exist, add it alongside the existing `vi.mock` calls at the top of the file.)

Then in the existing "returns 200 + booking_id on success + dispatches notification" test, add an assertion that the new email function is also called. After the existing notification assertion, add:

```ts
const { sendCustomRequestReceivedEmail } = await import('@/lib/email/resend');
expect(sendCustomRequestReceivedEmail).toHaveBeenCalled();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/__tests__/api/bookings-custom-request.test.ts
```

Expected: the success test fails because the route hasn't been updated yet.

- [ ] **Step 3: Update the route**

Read `src/app/api/bookings/custom-request/route.ts`. Find the existing `notifyCustomRequestReceived(...)` call (probably wrapped in a `.catch(() => {})` fire-and-forget pattern). The vendor's email needs to be fetched — extend the existing vendor lookup.

Current vendor lookup probably reads:

```ts
const { data: vendor } = await supabase
  .from('vendor_profiles')
  .select('id, user_id')
  .eq('slug', vendor_slug)
  .eq('is_active', true)
  .maybeSingle();
```

Change to:

```ts
const { data: vendor } = await supabase
  .from('vendor_profiles')
  .select('id, user_id, users:user_id(email)')
  .eq('slug', vendor_slug)
  .eq('is_active', true)
  .maybeSingle();
```

The `users:user_id(email)` join brings in the vendor's email. The result type is `vendor.users` which may be an object or array depending on the relation cardinality — typed as `{ email: string }` for a 1:1.

Then, after the existing `notifyCustomRequestReceived(...)` fire-and-forget call, add:

```ts
import { sendCustomRequestReceivedEmail } from '@/lib/email/resend';

// ... inside the route ...

// Fetch the vendor user's email from the join
const vendorEmail = vendor.users as { email: string } | { email: string }[] | null;
const email = Array.isArray(vendorEmail)
  ? vendorEmail[0]?.email
  : (vendorEmail as { email: string } | null)?.email;

if (email) {
  const descriptionPreview =
    description.length > 140 ? `${description.slice(0, 140)}…` : description;
  void sendCustomRequestReceivedEmail(email, {
    bookingId: inserted.id,
    coupleName: user.email ?? 'A couple',
    eventDate: event_date,
    eventType: event_type,
    guestCount: guest_count,
    descriptionPreview,
  }).catch((err) =>
    logger.error('sendCustomRequestReceivedEmail failed', err, { bookingId: inserted.id })
  );
}
```

The `void` + `.catch` pattern matches existing fire-and-forget email dispatches in `src/app/api/bookings/[id]/adjust/route.ts`.

- [ ] **Step 4: Run test to verify passing**

```bash
npm test -- src/__tests__/api/bookings-custom-request.test.ts
```

Expected: all tests passing (the new assertion + the existing 5).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bookings/custom-request/route.ts src/__tests__/api/bookings-custom-request.test.ts
git commit -m "feat(custom-request): wire sendCustomRequestReceivedEmail dispatch"
```

---

## Task 5: Add `sendNewsletterWelcomeEmail`

**Files:**

- Modify: `src/lib/email/resend.ts`

- [ ] **Step 1: Add the new function**

In `src/lib/email/resend.ts`, after the custom-request function (or alphabetically), add:

```ts
/**
 * Fired when a user subscribes to "The Bazaar Letter" via the footer signup.
 * Recipient: the subscriber. Sent for both new and already-subscribed
 * addresses (the upstream API is idempotent, and re-sending a welcome
 * email is a low-cost graceful response).
 */
export async function sendNewsletterWelcomeEmail(email: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to The Bazaar Letter',
    html: renderBrandedEmail({
      bodyHtml: `
        <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:0 0 16px;color:#1B1414;letter-spacing:-0.012em;">Welcome to The Bazaar Letter</h2>
        <p style="margin:0 0 16px;">Thanks for subscribing. We send <strong>monthly</strong> — newly verified vendors, real Chicago wedding photos, and the occasional honest note. No noise.</p>
        <p style="margin:24px 0;"><a href="${appUrl()}/vendors" style="display:inline-block;background:#1B1414;color:#FBF6EC;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">Browse vendors</a></p>
        <p style="margin:0;color:#5F5650;font-size:13px;">If this wasn't you, ignore this email — you won't hear from us again.</p>
      `,
    }),
  });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): sendNewsletterWelcomeEmail"
```

---

## Task 6: Wire `sendNewsletterWelcomeEmail` into newsletter subscribe route

**Files:**

- Modify: `src/app/api/newsletter/subscribe/route.ts`
- Modify: `src/__tests__/api/newsletter-subscribe.test.ts`

- [ ] **Step 1: Update the test mock**

Read `src/__tests__/api/newsletter-subscribe.test.ts`. Add to the existing mocks:

```ts
vi.mock('@/lib/email/resend', () => ({
  sendNewsletterWelcomeEmail: vi.fn().mockResolvedValue(true),
}));
```

In the "returns 200 + inserts on valid anonymous submission" test, after the existing assertions, add:

```ts
const { sendNewsletterWelcomeEmail } = await import('@/lib/email/resend');
expect(sendNewsletterWelcomeEmail).toHaveBeenCalledWith('jane@example.com');
```

In the idempotent-on-unique-violation test, also add (the welcome email should fire even on duplicate signups):

```ts
const { sendNewsletterWelcomeEmail } = await import('@/lib/email/resend');
expect(sendNewsletterWelcomeEmail).toHaveBeenCalledWith('jane@example.com');
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- src/__tests__/api/newsletter-subscribe.test.ts
```

Expected: 2 tests fail (success path + idempotent path) because route hasn't been updated.

- [ ] **Step 3: Update the route**

Read `src/app/api/newsletter/subscribe/route.ts`. Find the success-or-idempotent return point (after the insert + logger.info call, just before `return NextResponse.json({ ok: true })`).

Add the import at the top:

```ts
import { sendNewsletterWelcomeEmail } from '@/lib/email/resend';
```

Add the fire-and-forget email dispatch just before the `return`:

```ts
void sendNewsletterWelcomeEmail(email).catch((err) =>
  logger.error('sendNewsletterWelcomeEmail failed', err, { email_domain: email.split('@')[1] })
);
```

Place this AFTER the unique-violation success check (i.e., it should fire regardless of whether the row was inserted fresh or was a dup — same idempotency rationale).

- [ ] **Step 4: Run test to verify passing**

```bash
npm test -- src/__tests__/api/newsletter-subscribe.test.ts
```

Expected: all tests passing (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/newsletter/subscribe/route.ts src/__tests__/api/newsletter-subscribe.test.ts
git commit -m "feat(newsletter): wire sendNewsletterWelcomeEmail dispatch"
```

---

## Task 7: Wire orphan `sendBookingConfirmedEmail` into deposit-paid flow

**Files:**

- Modify: `src/services/payment.service.ts`

- [ ] **Step 1: Expand the deposit-paid select**

Read `src/services/payment.service.ts` around line 186–195. Find:

```ts
const { data: ctx } = await supabase
  .from('bookings')
  .select(
    'couple_email, couple_user_id, users!couple_user_id(email), vendor_profiles!inner(business_name, users!user_id(email))'
  )
  .eq('id', bookingId)
  .maybeSingle();
```

Expand the select to include vendor address fields + booking.vendor_notes:

```ts
const { data: ctx } = await supabase
  .from('bookings')
  .select(
    'couple_email, couple_user_id, vendor_notes, users!couple_user_id(email), vendor_profiles!inner(business_name, base_address_line_1, base_city, base_state, base_postal_code, users!user_id(email))'
  )
  .eq('id', bookingId)
  .maybeSingle();
```

- [ ] **Step 2: Update the import**

In the existing import block at the top:

```ts
import {
  sendDepositConfirmationEmail,
  sendCompletionEmailToVendor,
  sendReviewRequestEmail,
  sendCancellationEmail,
} from '@/lib/email/resend';
```

Add `sendBookingConfirmedEmail`:

```ts
import {
  sendDepositConfirmationEmail,
  sendBookingConfirmedEmail,
  sendCompletionEmailToVendor,
  sendReviewRequestEmail,
  sendCancellationEmail,
} from '@/lib/email/resend';
```

- [ ] **Step 3: Replace the couple-side deposit email**

Read the existing pattern around line 194–206:

```ts
const vp = ctx.vendor_profiles as unknown as {
  business_name: string;
  users: { email: string } | { email: string }[];
};
const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;

const coupleEmail =
  (ctx.users as unknown as { email: string } | null)?.email ?? (ctx.couple_email as string | null);

if (coupleEmail) {
  await sendDepositConfirmationEmail(coupleEmail, vp.business_name, amount, false);
}
if (vendorUser?.email) {
  await sendDepositConfirmationEmail(vendorUser.email, vp.business_name, amount, true);
}
```

Refactor to use the new fields + richer email for couple:

```ts
const vp = ctx.vendor_profiles as unknown as {
  business_name: string;
  base_address_line_1: string | null;
  base_city: string | null;
  base_state: string | null;
  base_postal_code: string | null;
  users: { email: string } | { email: string }[];
};
const vendorUser = Array.isArray(vp.users) ? vp.users[0] : vp.users;

const coupleEmail =
  (ctx.users as unknown as { email: string } | null)?.email ?? (ctx.couple_email as string | null);

// Format the vendor's full address from parts. Falls back to business_name
// if any part is missing (graceful degradation).
const vendorFullAddress =
  [vp.base_address_line_1, vp.base_city, vp.base_state, vp.base_postal_code]
    .filter(Boolean)
    .join(', ') || vp.business_name;

const vendorNotes = (ctx as { vendor_notes?: string | null }).vendor_notes ?? null;

if (coupleEmail) {
  // Couple gets the richer confirmation with vendor address + notes revealed.
  await sendBookingConfirmedEmail(
    coupleEmail,
    vp.business_name,
    vendorFullAddress,
    vendorNotes,
    bookingId
  );
}
if (vendorUser?.email) {
  // Vendor still gets the generic deposit-confirmation (no address reveal needed).
  await sendDepositConfirmationEmail(vendorUser.email, vp.business_name, amount, true);
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Verify existing payment tests still pass**

```bash
npm test -- src/__tests__/services/payment.service.test.ts
```

Expected: tests pass (or maybe one fails because it asserts a `sendDepositConfirmationEmail` call to the couple — if so, update that assertion to expect `sendBookingConfirmedEmail` for the couple-side call).

- [ ] **Step 6: Commit**

```bash
git add src/services/payment.service.ts src/__tests__/services/payment.service.test.ts
git commit -m "feat(payment): wire sendBookingConfirmedEmail for couple on deposit_paid"
```

---

## Task 8: Audit of existing 12 emails + write `AUDIT_EMAIL_WIRING.md`

**Files:**

- Create: `docs/AUDIT_EMAIL_WIRING.md`

This task is investigative. For each of the 12 already-wired email functions (the 14 from resend.ts minus the 2 brand-new), grep for the dispatch site + read the call site + capture the audit row.

- [ ] **Step 1: Find each dispatch site**

For each function below, run:

```bash
grep -rn "{functionName}" src/ --include="*.ts" --include="*.tsx" | grep -v "lib/email/resend.ts" | grep -v "__tests__"
```

Replace `{functionName}` with each:

- `sendBookingRequestEmail`
- `sendBookingReceiptEmail`
- `sendQuoteEmail` (legacy, expect 0 callsites OK)
- `sendVendorAcceptedEmail`
- `sendAdjustedQuoteEmail`
- `sendCoupleAcceptedAdjustedEmail`
- `sendCoupleDeclinedEmail`
- `sendDepositConfirmationEmail`
- `sendBookingAutoCancelEmail`
- `sendExpirationEmail` (legacy)
- `sendCompletionEmailToVendor`
- `sendReviewRequestEmail`
- `sendCancellationEmail`

For each, note: file path + line number + the surrounding function context.

- [ ] **Step 2: Open each dispatch site + verify**

For each one:

1. Open the dispatch file at the line found
2. Read the call signature — does it match the function declaration in resend.ts?
3. Read the call timing — is the email fired at the right point in the flow (e.g., AFTER a successful state transition, not before)?
4. Read the surrounding state — are the args (vendorName, amount, etc.) accurate vs. the actual DB row at that point?

- [ ] **Step 3: Write the audit doc**

Write to `docs/AUDIT_EMAIL_WIRING.md`:

```markdown
# Email Wiring Audit — 2026-05-26

Audit performed as part of PR `feat/baazar-resend-wireup`. For each transactional email function in `src/lib/email/resend.ts`, this doc records:

- Dispatch site (file:line)
- Status (✅ correct / 🟡 stale copy / ❌ broken wiring)
- Notes / action

## sendBookingRequestEmail

- **Dispatch:** `<file>:<line>`
- **Status:** ✅ / 🟡 / ❌
- **Notes:** {what was found}
- **Action:** {none / copy fix landed / flagged for follow-up}

## sendBookingReceiptEmail

...

[continue for all 12]

## Summary

- ✅ Correct: N functions
- 🟡 Stale copy (fixed inline): M functions
- ❌ Broken wiring: K functions

[List any flagged follow-ups for future PRs]
```

Apply this template to each of the 12. For any that are clearly broken or have stale copy that's easy to fix, land the fix in the same PR (just include those file changes in a separate commit).

- [ ] **Step 4: If any inline fixes were needed, commit them separately**

If during the audit you found and fixed any wiring/copy issues:

```bash
git add <files>
git commit -m "fix(email): audit findings — {summary of fix}"
```

(The audit doc itself goes in Step 5 below.)

- [ ] **Step 5: Commit the audit doc**

```bash
git add docs/AUDIT_EMAIL_WIRING.md
git commit -m "docs(audit): email wiring audit results"
```

---

## Task 9: DESIGN.md update

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Add the entry**

Read the `components:` block. Append (matching indent):

```yaml
transactional-email:
  pattern: 'All transactional + welcome emails share a single M+ chrome via renderBrandedEmail() in src/lib/email/render.ts. Cream page bg + cream-soft header band + Spectral-fallback baazar wordmark with hot-pink dot + hairline divider + 600px content block + ink-soft footer. Table-based + inline styles for email-client compatibility (Outlook, Gmail, Apple Mail).'
  tokens: "Hardcoded hex in inline styles because email clients don't support CSS variables. Matches DESIGN.md palette: #FBF6EC (cream), #F4ECDC (cream-soft), #1B1414 (ink), #5F5650 (ink-soft), #D1006C (hot-pink), #E8DFC8 (hairline). Drift risk: palette updates require hand-update of email styles."
  fonts: "Wordmark = Georgia (Spectral fallback in email clients). Body = Helvetica/Arial system stack (Schibsted Grotesk doesn't render in most email clients)."
  cta-buttons: 'Inline-styled <a> with ink bg, cream text, 6px radius, 12px/24px padding, font-weight:600. Centered or left-aligned in their paragraph wrapper.'
  unsubscribe: "Not Day 1 — transactional CAN-SPAM exempt; newsletter welcome relies on a 'if not you, ignore' line. Future sub-project adds /unsubscribe route + per-user preferences."
  dispatch: "Each send*Email() lives in src/lib/email/resend.ts and is called from a single dispatch site (notifications.service.ts helpers OR API routes). Future architectural refactor: have notifications.service.ts auto-fire emails so the pattern can't drift."
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): add transactional-email entry to components"
```

---

## Task 10: Visual verification

**Files:** none (Resend dashboard / inbox testing only)

This task confirms the rendered emails look correct in real inboxes. If you don't have direct Resend dashboard access, use a personal email account to receive test sends.

- [ ] **Step 1: Trigger each email type from dev DB**

Easiest path: spin up `npm run dev`, walk through actual product flows that fire each email. Alternative: write a one-off script in `scripts/test-emails.ts` that imports each `send*Email()` and calls it with stub data, sending to your own email.

Either way, target each of the 14 + 2 new = 16 email types:

1. Booking request (vendor)
2. Booking receipt (couple)
3. Vendor accepted (couple)
4. Adjusted quote (couple)
5. Couple accepted adjusted (vendor)
6. Couple declined (vendor)
7. Deposit confirmation — vendor side
8. Booking confirmed — couple side (replaces deposit confirmation for couple)
9. Booking auto-cancel
10. Completion (vendor)
11. Review request (couple)
12. Cancellation
13. Quote (legacy, optional)
14. Expiration (legacy, optional)
15. **Custom request received (NEW)**
16. **Newsletter welcome (NEW)**

- [ ] **Step 2: Inspect each in inbox**

For each email:

- Brand header renders (cream band, baazar wordmark, hot-pink dot)
- Body content matches the expected template
- CTA button looks like a button (some clients flatten styled `<a>` into plain text — check Gmail + Apple Mail at minimum)
- Footer year is current
- No broken whitespace, no exposed `${...}` template artifacts
- Subject line previews cleanly

- [ ] **Step 3: Document any client-specific issues**

If a specific client (Outlook, Gmail web, Apple Mail mobile) renders differently:

- Major issue (broken layout, illegible text): fix inline, re-test
- Cosmetic (minor padding diff): log in `docs/AUDIT_EMAIL_WIRING.md` as a follow-up note + proceed

No commit unless fixes were applied.

---

## Task 11: Plan commit + push + PR

**Files:** none — git operations only.

- [ ] **Step 1: Commit the plan doc if untracked**

```bash
git status --short docs/superpowers/plans/2026-05-26-baazar-resend-wireup.md
```

If `??`:

```bash
git add docs/superpowers/plans/2026-05-26-baazar-resend-wireup.md
git commit -m "docs(plan): Baazar Resend email wire-up implementation plan"
```

- [ ] **Step 2: Final verification**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, lint clean (pre-existing warnings OK), tests pass (7 new in render.test + updated assertions in custom-request + newsletter tests). 3 pre-existing failures unchanged.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/baazar-resend-wireup
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(email): Baazar transactional email audit + 3 new touchpoints + brand chrome" --body "$(cat <<'EOF'
## Summary

Implements [the Resend wire-up spec](docs/superpowers/specs/2026-05-26-baazar-resend-wireup-design.md). Closes 3 transactional-email gaps + brand-polishes all 14+ emails through a shared `renderBrandedEmail()` helper.

## What's in this PR

- **`renderBrandedEmail()` helper** — `src/lib/email/render.ts`. Wraps any body in M+ branded chrome: cream page bg + cream-soft header band + Spectral-fallback baazar wordmark + hot-pink dot + hairline + 600px content + ink-soft footer. Table-based + inline styles for email-client compatibility. 7 unit tests.
- **All 14 existing emails refactored** to use the helper. Inbox impressions are now visually consistent.
- **`sendCustomRequestReceivedEmail`** (NEW) — wired into `POST /api/bookings/custom-request`. Vendors receive an email with couple name + event date + type + guest count + description preview + "Send a quote" CTA.
- **`sendNewsletterWelcomeEmail`** (NEW) — wired into `POST /api/newsletter/subscribe`. Fires for both new and idempotent-duplicate signups.
- **`sendBookingConfirmedEmail` orphan wired in** — `src/services/payment.service.ts` deposit_paid flow. Couples now get the richer confirmation with vendor address + notes revealed; vendors still get the generic deposit confirmation.
- **`docs/AUDIT_EMAIL_WIRING.md`** — audit results for all 14 functions: dispatch sites + status + any inline fixes applied.
- **DESIGN.md** — adds `transactional-email:` component entry.

## Out of scope (deferred per spec)

- /unsubscribe route + per-user email preferences
- Newsletter SEND infrastructure (cron + audience export)
- Explicit plain-text fallback (Resend auto-generates)
- i18n / locale-aware copy
- Refactoring notifications.service.ts to auto-fire emails

## Test plan

- [ ] `npm test` passes
- [ ] Trigger booking request flow → vendor receives "New booking request" email
- [ ] Trigger booking accepted flow → couple receives "{vendor} accepted your booking" with deposit CTA
- [ ] Pay deposit → couple receives "Booking confirmed — {vendor}" with FULL address; vendor receives "Deposit received — {vendor}" with $ amount
- [ ] Submit custom request → vendor receives "New custom request" with description preview
- [ ] Subscribe to newsletter → email receives "Welcome to The Bazaar Letter"
- [ ] All emails render the M+ brand header (cream band + baazar wordmark + hot-pink dot)
- [ ] All CTA buttons are styled (ink bg + cream text + 6px radius)
- [ ] Footer year is 2026

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL.

- [ ] **Step 5: Report**

Report DONE | DONE_WITH_CONCERNS | BLOCKED with:

- Final test results
- PR URL
- Audit findings summary (✅/🟡/❌ counts)
- Any concerns (rendering issues found during Task 10, etc.)
