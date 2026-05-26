# Email Wiring Audit — 2026-05-26

Audit performed as part of PR `feat/baazar-resend-wireup`. For each transactional email function in `src/lib/email/resend.ts`, this doc records:

- Dispatch site (file:line)
- Status (✅ correct / 🟡 stale copy fixed inline / ❌ broken wiring)
- Notes / action

---

## sendBookingRequestEmail

- **Dispatch:** `src/app/api/bookings/route.ts:48`
- **Recipient:** Vendor
- **Trigger:** After couple submits booking → `createBooking` succeeds → vendor email fetched via `users!vendor_profiles_user_id_fkey(email)` join
- **Status:** ✅
- **Notes:** Fire-and-forget with `.catch` logger. Args (vendorEmail, business_name, bookingId) match function signature exactly. Fires at the right point (after successful booking insert).
- **Action:** None

---

## sendBookingReceiptEmail

- **Dispatch:** `src/app/api/bookings/route.ts:55`
- **Recipient:** Couple
- **Trigger:** Same route, after booking create — couple email fetched from `users` table
- **Status:** ✅
- **Notes:** Fire-and-forget with `.catch` logger. Args (coupleEmail, bookingId) match signature. Fires correctly.
- **Action:** None

---

## sendQuoteEmail (legacy)

- **Dispatch:** None (0 callsites)
- **Recipient:** N/A — legacy only
- **Status:** ✅ (intentionally unwired — legacy flow replaced by `sendVendorAcceptedEmail`)
- **Notes:** Function is exported for backward-compat. Confirmed the new flow uses `sendVendorAcceptedEmail` instead. Subject line was `"Quote Received from ${safeName}"` (Title Case) — normalized to `"Quote received from ${safeName}"` (sentence case) in RE-2 refactor.
- **Action:** None required. Retain as legacy export.

---

## sendVendorAcceptedEmail

- **Dispatch:** `src/app/api/bookings/[id]/accept/route.ts:57`
- **Recipient:** Couple
- **Trigger:** After vendor accepts booking → deposit checkout created → email fires fire-and-forget via IIFE
- **Status:** 🟡 Stale copy fixed inline
- **Notes:** Old body said "Pay your hold deposit (30%) to confirm." but actual deposit rate is 10%. Fixed to "10%" in the RE-2 refactor.
- **Action:** Fixed inline in RE-2 refactor commit.

---

## sendAdjustedQuoteEmail

- **Dispatch:** `src/app/api/bookings/[id]/adjust/route.ts:41`
- **Recipient:** Couple
- **Trigger:** After vendor submits adjusted quote → fires fire-and-forget via IIFE
- **Status:** ✅
- **Notes:** Args (email, vendorName, total_price_cents, reason, explanation, bookingId) match signature. `explanation` correctly nullable. Fires after successful `adjustBookingQuote`.
- **Action:** None

---

## sendCoupleAcceptedAdjustedEmail

- **Dispatch:** `src/app/api/bookings/[id]/accept-adjusted/route.ts:36`
- **Recipient:** Vendor
- **Trigger:** After couple accepts adjusted quote → fires fire-and-forget
- **Status:** ✅
- **Notes:** Args (vendorUser.email, coupleName, totalCents, bookingId) match signature. `coupleName` derived from `booking.couple_full_name` with fallback. Fires at the right point.
- **Action:** None

---

## sendCoupleDeclinedEmail

- **Dispatch:** `src/app/api/bookings/[id]/decline-adjusted/route.ts:29`
- **Recipient:** Vendor
- **Trigger:** After couple declines adjusted quote → fires fire-and-forget
- **Status:** ✅
- **Notes:** Args (vendorUser.email, bookingId) match signature. Vendor email fetched via join. Fires correctly.
- **Action:** None

---

## sendDepositConfirmationEmail

- **Dispatch:** `src/services/payment.service.ts:228` (vendor-side only, after RE-7)
- **Recipient:** Vendor (couple now gets `sendBookingConfirmedEmail`)
- **Trigger:** `handlePaymentSuccess` webhook handler → deposit_paid → vendor-side confirmation
- **Status:** ✅
- **Notes:** After RE-7, couple side replaced with richer `sendBookingConfirmedEmail`. Vendor still gets this with `isVendor=true`. Args match. Await pattern (not fire-and-forget) — acceptable for webhook context.
- **Action:** None

---

## sendBookingConfirmedEmail (orphan → now wired in RE-7)

- **Dispatch:** `src/services/payment.service.ts:218`
- **Recipient:** Couple
- **Trigger:** `handlePaymentSuccess` → deposit_paid → couple gets richer confirmation with vendor address + notes
- **Status:** ✅ (newly wired in this PR)
- **Notes:** Was previously defined but never dispatched. RE-7 wired it into the deposit_paid flow. Vendor address assembled from `base_address_line_1, base_city, base_state, base_postal_code` with `business_name` fallback. `vendor_notes` from `bookings.vendor_notes`.
- **Action:** None — wired in this PR.

---

## sendBookingAutoCancelEmail

- **Dispatch:** `src/services/booking.service.ts:332` (couple) + `:335` (vendor)
- **Recipient:** Both couple and vendor
- **Trigger:** `autoCancelExpiredBookings` cron sweep → booking expired → both parties notified
- **Status:** ✅
- **Notes:** `void` fire-and-forget pattern. Args (email, recipientRole, bookingId) match. Fires to both parties. The `recipientRole` param is a no-op in current body (same copy for both) — documented for future copy personalization.
- **Action:** None

---

## sendExpirationEmail (legacy)

- **Dispatch:** `src/services/booking.service.ts:280` (couple) + `:283` (vendor)
- **Recipient:** Both couple and vendor
- **Trigger:** `expireStaleRequests` RPC sweep → old-flow `pending` bookings expire
- **Status:** ✅ (legacy, intentional)
- **Notes:** Legacy flow only — new auto-cancel uses `sendBookingAutoCancelEmail`. Subject case normalized from "Booking Request Expired" → "Booking request expired" in RE-2. Both couple and vendor receive appropriate variant via `isVendor` flag.
- **Action:** None

---

## sendCompletionEmailToVendor

- **Dispatch:** `src/services/payment.service.ts:861`
- **Recipient:** Vendor
- **Trigger:** `sendCompletionEmails` → called from `completeBooking` → booking marked completed
- **Status:** ✅
- **Notes:** Args (vendorEmail, business_name, vendorPayout) match. `vendorPayout` derived from sum of `vendor_payout` on `transactions`. Fires correctly after completion.
- **Action:** None

---

## sendReviewRequestEmail

- **Dispatch:** `src/services/payment.service.ts:864`
- **Recipient:** Couple
- **Trigger:** `sendCompletionEmails` → called from `completeBooking` → couple gets review request
- **Status:** ✅
- **Notes:** Args (coupleEmail, business_name, bookingId) match. Fires correctly alongside `sendCompletionEmailToVendor` in same `sendCompletionEmails` function.
- **Action:** None

---

## sendCancellationEmail

- **Dispatch:** `src/services/payment.service.ts:636` (couple) + `:646` (vendor)
- **Recipient:** Both couple and vendor
- **Trigger:** `notifyCancellation` → called from `cancelBooking` → both parties notified
- **Status:** ✅
- **Notes:** Args (email, business_name, cancellerRole, recipientRole, refundCents, reason) match. Both couple and vendor called with correct `recipientRole`. `actor` string derived correctly. `refundLine` correct. Uses `await` (not fire-and-forget) — acceptable in cancellation helper.
- **Action:** None

---

## Summary

- ✅ Correct: 13 functions
- 🟡 Stale copy (fixed inline in RE-2 refactor): 1 function (`sendVendorAcceptedEmail` — deposit rate was 30%, corrected to 10%)
- ❌ Broken wiring: 0 functions

### Newly wired in this PR

- `sendBookingConfirmedEmail` — was defined but never dispatched. Now wired in `payment.service.ts:handlePaymentSuccess` replacing the couple-side `sendDepositConfirmationEmail`.
- `sendCustomRequestReceivedEmail` — new function, wired in `src/app/api/bookings/custom-request/route.ts`.
- `sendNewsletterWelcomeEmail` — new function, wired in `src/app/api/newsletter/subscribe/route.ts`.

### Follow-up notes for future PRs

1. **`sendQuoteEmail` (legacy)** — 0 callsites. Safe to keep but could be removed if legacy `pending` flow is fully retired. No urgency.
2. **`sendExpirationEmail` (legacy)** — still wired in `expireStaleRequests` sweep. Once legacy `pending` flow is retired and `autoCancelExpiredBookings` covers all cases, this can be removed.
3. **Couple-side copy in `sendBookingAutoCancelEmail`** — currently same copy for both couple and vendor. Future PR can personalize with `recipientRole`.
4. **Manual inbox test** — visual rendering was not tested against real inboxes (no Resend dashboard access in this session). The user should trigger each email type in dev before merging to prod. See Task 10 in the plan for the test checklist.
5. **Architecture: notifications.service.ts auto-firing emails** — currently each API route/service fires emails independently. A future refactor could have `notifications.service.ts` auto-dispatch emails so the pattern can't drift.
