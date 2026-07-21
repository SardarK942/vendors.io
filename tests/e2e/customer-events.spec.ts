/**
 * Customer-events E2E — wizard, journal vendor board, task check-off, and
 * cross-tenant scoping. Feature spec: docs/superpowers/specs/2026-07-18-customer-events-design.md
 * (migration 00072, Task 13 of the same sub-project).
 *
 * 1. Wizard happy path drives the real 5-step UI (/dashboard/events/new →
 *    redirects to /events/new) end to end and lands on the journal.
 * 2/3/4 seed the event graph directly via the service-role client (mirrors
 *    createEventWithGraph's table shape) so those specs don't re-drive the
 *    whole wizard and stay independent of spec 1's ordering.
 */

import { test, expect } from '@playwright/test';
import { seedCouple, cleanup, getServiceClient, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

interface SeededEvent {
  eventId: string;
  functionId: string;
}

/** Seeds an event + one function directly, bypassing the wizard UI. */
async function seedEvent(
  couple: TestUser,
  opts: { totalBudgetCents?: number | null; functionLabel?: string } = {}
): Promise<SeededEvent> {
  const supabase = getServiceClient();
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      couple_user_id: couple.id,
      name: 'E2E Seeded Wedding',
      celebration_type: 'wedding',
      total_budget_cents: opts.totalBudgetCents ?? null,
    })
    .select('id')
    .single();
  if (eventError || !event) throw new Error(`seedEvent: ${eventError?.message}`);

  const { data: fn, error: fnError } = await supabase
    .from('event_functions')
    .insert({
      event_id: event.id,
      sequence: 1,
      label: opts.functionLabel ?? 'Reception',
      event_type_id: 'reception',
    })
    .select('id')
    .single();
  if (fnError || !fn) throw new Error(`seedEvent function: ${fnError?.message}`);

  return { eventId: event.id, functionId: fn.id };
}

test.describe('customer events', () => {
  let couple: TestUser | null = null;

  // Next.js dev-mode compiles each route module (server + API routes) on
  // first request, and the journal route in particular pulls in a heavy
  // import chain (events.service -> logger -> Sentry/Prisma instrumentation)
  // that, cold, can take well past the shared loginAs() helper's 15s
  // post-submit waitForURL — confirmed by running tests/e2e/auth.spec.ts in
  // isolation against a cold server, which hits the exact same timeout on
  // its very first login. Route compilation is a server-side, per-process
  // cache — it doesn't matter which client triggers it — so fire plain HTTP
  // requests (no browser, no JS execution, cheap) at every route/endpoint
  // this file exercises before any timed browser test starts.
  test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(120_000);
    const routes = [
      '/login',
      '/dashboard',
      '/events/new',
      '/dashboard/events/00000000-0000-0000-0000-000000000000',
    ];
    for (const url of routes) {
      await request.get(url, { timeout: 60_000 }).catch(() => {});
    }
    await request
      .post('/api/events/00000000-0000-0000-0000-000000000000/tasks', {
        timeout: 60_000,
        data: { title: 'warmup' },
        failOnStatusCode: false,
      })
      .catch(() => {});
    await request
      .post('/api/events/00000000-0000-0000-0000-000000000000/needs', {
        timeout: 60_000,
        data: {
          op: 'add_slot',
          event_function_id: '00000000-0000-0000-0000-000000000000',
          category: 'photography',
        },
        failOnStatusCode: false,
      })
      .catch(() => {});
  });

  test.afterEach(async () => {
    await cleanup(couple);
    couple = null;
  });

  test('wizard happy path creates event and lands on journal', async ({ page }) => {
    test.setTimeout(120_000);
    couple = await seedCouple({ markOnboardingComplete: true });
    await loginAs(page, couple);

    // /dashboard/events/new 307-redirects to the full-screen wizard at /events/new.
    await page.goto('/dashboard/events/new');
    await page.waitForURL(/\/events\/new/);

    // ── Step 1: Basics ──────────────────────────────────────────────────────
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    // Name is prefilled from the couple's full_name ("E2E Couple's Wedding").
    await expect(page.getByLabel('Event name')).toHaveValue(/E2E Couple/);
    const celebrationPicker = page.locator('button[role="combobox"]');
    await celebrationPicker.click();
    await page.getByRole('option', { name: /Wedding \/ Shaadi/i }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 2: Functions ────────────────────────────────────────────────────
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await page.getByRole('button', { name: 'Mehndi / Henna' }).click();
    await page.getByRole('button', { name: 'Reception' }).click();
    // Set one date on the first function row.
    await page.locator('input[type="date"]').first().fill('2027-06-15');
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 3: Vendors per function ────────────────────────────────────────
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    // Mehndi function card renders a "Mehndi / Henna — already booked?" switch
    // for the mehndi vendor category (seeded via DEFAULT_CATEGORIES on Next).
    await page.getByLabel(/Mehndi \/ Henna — already booked\?/i).click();
    await page.getByPlaceholder('Vendor name').first().fill('Henna by Zara');
    await page.getByPlaceholder('$ amount').first().fill('500');
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 4: Budget ──────────────────────────────────────────────────────
    await expect(page.getByText('Step 4 of 5')).toBeVisible();
    await page.getByLabel('Total budget').fill('30000');
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 5: Checklist — keep one suggested task, finish ─────────────────
    await expect(page.getByText('Step 5 of 5')).toBeVisible();
    const suggestionChips = page.locator('main button[aria-pressed]');
    await suggestionChips.first().click();
    await page.getByRole('button', { name: /Finish setup/i }).click();

    // ── Journal ──────────────────────────────────────────────────────────────
    await expect(page).toHaveURL(/\/dashboard\/events\/[0-9a-f-]+/, { timeout: 15_000 });
    await expect(page.getByText('Henna by Zara')).toBeVisible();
    await expect(page.getByText('Still needed').first()).toBeVisible();
  });

  test('manual vendor add appears with amount in board and budget', async ({ page }) => {
    test.setTimeout(90_000);
    couple = await seedCouple({ markOnboardingComplete: true });
    const seeded = await seedEvent(couple, { totalBudgetCents: 1_000_000 });
    await loginAs(page, couple);

    await page.goto(`/dashboard/events/${seeded.eventId}`);
    await expect(page.getByText('Reception').first()).toBeVisible();

    await page.getByRole('button', { name: '＋ Add vendor' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Add a vendor/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Booked off Baazar' })).toHaveAttribute(
      'data-state',
      'active'
    );

    // Category defaults to the first addable category (Photography) — leave as-is.
    await dialog.getByLabel('Vendor name').fill('Dreamy Films');
    await dialog.getByLabel('Amount (optional)').fill('1200');
    await dialog.getByRole('button', { name: 'Add vendor' }).click();

    await expect(page.getByText('Vendor added')).toBeVisible();
    await expect(page.getByText('Dreamy Films')).toBeVisible();
    await expect(page.getByText('Photography · $1,200.00')).toBeVisible();

    // Budget panel — committed spend rolls up by category.
    const budgetPanel = page.locator('#budget-panel');
    await expect(
      budgetPanel.getByText('$1,200.00 committed of $10,000.00', { exact: false })
    ).toBeVisible();
    await expect(budgetPanel.getByText('Photography')).toBeVisible();
  });

  test('task check-off strikes through and survives reload', async ({ page }) => {
    test.setTimeout(90_000);
    couple = await seedCouple({ markOnboardingComplete: true });
    const seeded = await seedEvent(couple);
    const supabase = getServiceClient();
    const { data: taskRow, error } = await supabase
      .from('event_tasks')
      .insert({ event_id: seeded.eventId, title: 'Order outfits' })
      .select('id')
      .single();
    if (error || !taskRow) throw new Error(`seed task: ${error?.message}`);

    await loginAs(page, couple);
    await page.goto(`/dashboard/events/${seeded.eventId}`);

    const taskRowLocator = page.getByText('Order outfits').locator('..');
    const checkbox = taskRowLocator.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();
    // The checkbox is React-controlled by task.completed_at, which only flips
    // after the PATCH round-trips and router.refresh() re-renders — so a
    // plain click() (not check(), which insists the native DOM state flips
    // synchronously) plus a polling expect() is the reliable way to drive it.
    await checkbox.click();
    await expect(checkbox).toBeChecked({ timeout: 10_000 });

    const taskLabel = page.getByText('Order outfits');
    await expect(taskLabel).toHaveClass(/line-through/);

    await page.reload();
    const checkboxAfterReload = page.getByText('Order outfits').locator('..').getByRole('checkbox');
    await expect(checkboxAfterReload).toBeChecked();
    await expect(page.getByText('Order outfits')).toHaveClass(/line-through/);
  });

  test('cross-tenant: couple B visiting couple A journal gets 404', async ({ page }) => {
    test.setTimeout(90_000);
    couple = await seedCouple({ markOnboardingComplete: true }); // couple A
    const seeded = await seedEvent(couple);
    const coupleB = await seedCouple({ markOnboardingComplete: true });

    try {
      await loginAs(page, coupleB);
      await page.goto(`/dashboard/events/${seeded.eventId}`);
      const bodyText = await page.locator('body').textContent();
      const is404 =
        bodyText?.toLowerCase().includes('404') ||
        bodyText?.toLowerCase().includes('page not found') ||
        bodyText?.toLowerCase().includes('could not be found');
      expect(is404).toBe(true);
    } finally {
      await cleanup(coupleB);
    }
  });
});
