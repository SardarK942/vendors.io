# Testing Strategy — Chicago Desi Wedding Vendor Marketplace

## Testing Philosophy

- Test the **critical path first**: booking flow (request → quote → deposit → confirm)
- Prefer **integration tests** over unit tests for API routes
- Use **manual testing** for Stripe Connect flows until automated E2E is set up
- Never ship a feature without at least one verification pass

---

## Test Stack

| Type              | Tool                        | Purpose                                         |
| ----------------- | --------------------------- | ----------------------------------------------- |
| Unit Tests        | Vitest                      | Service layer business logic, utility functions |
| Integration Tests | Vitest + Supabase local     | API route handlers with real database           |
| E2E Tests         | Playwright                  | Full user flows in browser                      |
| Type Checking     | TypeScript (`tsc --noEmit`) | Catch type errors at build time                 |
| Linting           | ESLint                      | Code quality and consistency                    |
| Formatting        | Prettier                    | Consistent code formatting                      |

## Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests (requires local Supabase)
npm run test:integration

# Run E2E tests (requires dev server running)
npm run test:e2e

# Type check
npm run typecheck        # tsc --noEmit

# Lint
npm run lint             # eslint . --ext .ts,.tsx
npm run lint:fix         # eslint . --ext .ts,.tsx --fix

# Format
npm run format           # prettier --write .
npm run format:check     # prettier --check .
```

## Pre-Commit Hooks (Husky + lint-staged)

```json
// package.json (lint-staged config)
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

Pre-commit runs:

1. ESLint with auto-fix on staged `.ts`/`.tsx` files
2. Prettier formatting on all staged files
3. If any check fails, commit is blocked — **fix before retrying**

---

## What to Test (Priority Order)

### P0: Critical Path (Must test before launch)

1. **Booking state machine transitions**
   - pending → quoted (vendor submits quote)
   - pending → expired (72-hour timeout)
   - quoted → deposit_paid (Stripe payment succeeds)
   - deposit_paid → confirmed (vendor confirms)
   - All decline/cancel paths

2. **Stripe webhook handling**
   - `payment_intent.succeeded` → updates booking status + reveals contact
   - `payment_intent.payment_failed` → booking stays in `quoted`
   - `account.updated` → vendor onboarding completion
   - Webhook signature verification

3. **Contact reveal logic (anti-backdooring)**
   - Couple contact hidden when `couple_contact_revealed = false`
   - Contact revealed ONLY after deposit payment
   - API never leaks contact info in any other state

4. **Authentication & authorization**
   - Only couples can create booking requests
   - Only vendors can submit quotes
   - Only the relevant couple/vendor can see their bookings
   - RLS policies enforce data isolation

### P1: Important (Test in Week 9)

5. **AI search returns relevant results**
   - "Bollywood DJ" returns DJ category vendors
   - "Mehndi artist near Chicago" returns mehndi vendors
   - Fallback to full-text search when semantic results < 5

6. **Vendor profile CRUD**
   - Claim flow creates profile correctly
   - Image upload to R2 works
   - Profile updates reflect immediately

7. **Email notifications fire correctly**
   - Booking request → vendor gets email
   - Quote submitted → couple gets email
   - Deposit paid → both get email

### P2: Nice to Have

8. **Mobile responsive layouts** (manual visual check)
9. **SEO metadata on vendor pages** (manual check)
10. **Performance** (Lighthouse audit, search < 2s)

---

## Unit Test Examples

### Booking Service Tests

```typescript
// __tests__/services/booking.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { validateStateTransition } from '@/services/booking.service';

describe('Booking State Machine', () => {
  it('allows pending → quoted transition', () => {
    expect(validateStateTransition('pending', 'quoted')).toBe(true);
  });

  it('allows quoted → deposit_paid transition', () => {
    expect(validateStateTransition('quoted', 'deposit_paid')).toBe(true);
  });

  it('rejects pending → confirmed (must go through quoted + deposit)', () => {
    expect(validateStateTransition('pending', 'confirmed')).toBe(false);
  });

  it('rejects confirmed → pending (no backward transitions)', () => {
    expect(validateStateTransition('confirmed', 'pending')).toBe(false);
  });
});
```

### Price Formatting Tests

```typescript
// __tests__/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice } from '@/lib/utils';

describe('formatPrice', () => {
  it('formats cents to USD', () => {
    expect(formatPrice(15000)).toBe('$150.00');
    expect(formatPrice(50)).toBe('$0.50');
    expect(formatPrice(0)).toBe('$0.00');
  });
});
```

---

## E2E Test Scenarios (Playwright)

### Happy Path: Complete Booking

```typescript
// e2e/booking-flow.spec.ts
import { test, expect } from '@playwright/test';

test('complete booking flow', async ({ page }) => {
  // 1. Couple signs up
  await page.goto('/signup');
  await page.fill('[name="email"]', 'couple@test.com');
  await page.fill('[name="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  // 2. Search for vendor
  await page.goto('/vendors');
  await page.fill('[data-testid="search-input"]', 'Mehndi artist');
  await page.click('[data-testid="search-button"]');
  await expect(page.locator('[data-testid="vendor-card"]')).toBeVisible();

  // 3. View vendor profile
  await page.click('[data-testid="vendor-card"]:first-child');
  await expect(page.locator('[data-testid="vendor-name"]')).toBeVisible();

  // 4. Submit booking request
  await page.click('[data-testid="request-booking-button"]');
  await page.fill('[name="eventDate"]', '2026-06-15');
  await page.selectOption('[name="eventType"]', 'wedding');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=Request submitted')).toBeVisible();
});
```

---

## Manual Testing Checklist (Pre-Launch)

### Desktop Browser (Chrome + Safari)

- [ ] Homepage loads with AI search bar
- [ ] Category browsing shows correct vendors
- [ ] Vendor profile loads with images, pricing, bio
- [ ] Booking request form submits successfully
- [ ] Vendor dashboard shows received requests
- [ ] Quote submission works
- [ ] Stripe Checkout flow completes
- [ ] Booking confirmation email received
- [ ] Contact info revealed after deposit

### Mobile Browser (iPhone Safari + Android Chrome)

- [ ] All above flows work on mobile viewport
- [ ] Navigation menu works (hamburger/drawer)
- [ ] Forms are usable on small screens
- [ ] Images load and are properly sized
- [ ] Stripe Checkout works on mobile

### Stripe-Specific Testing

- [ ] Vendor can complete Stripe Connect onboarding (use test mode)
- [ ] Hold deposit creates payment intent correctly
- [ ] Webhook fires on successful payment
- [ ] Refund works when vendor declines
- [ ] Platform fee calculated correctly (5-10%)
- Use Stripe test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline)

---

## Verification Loop (After Every Feature)

```
1. Code compiles:        npm run typecheck
2. Lint passes:          npm run lint
3. Tests pass:           npm test
4. Manual smoke test:    Open browser, test the feature
5. Mobile check:         Resize browser to 375px width
6. Commit:               git add . && git commit (hooks run automatically)
```

If any step fails, **fix before moving on**. Do not accumulate tech debt.

---

## Go/No-Go Criteria (End of Week 9)

Before launching in Week 10, ALL of these must be true:

- [ ] Complete end-to-end booking flow working in test mode
- [ ] Stripe webhook receiving events correctly
- [ ] At least 15 real vendor profiles seeded
- [ ] Mobile responsive on iPhone + Android
- [ ] Email notifications sending correctly

If any fail, delay launch 1 week. Better to launch May 5 with a working product than April 28 with broken payments.
