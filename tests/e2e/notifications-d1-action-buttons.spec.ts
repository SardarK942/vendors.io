/**
 * D.1 Action-buttons E2E spec — surface check
 *
 * For each notification type in NOTIFICATION_ACTIONS, seeds a notification row
 * directly into the DB via service-role, signs in as the recipient role, opens
 * the bell dropdown, and asserts:
 *   1. The card renders with the expected primary action label.
 *   2. The action button's href contains the expected ?action=X query (or just
 *      /dashboard/bookings/[id] for View-booking actions with no query param).
 *
 * This is a pure surface check — no booking state machine, no API mutations.
 * The notification row doesn't need a real booking; metadata.booking_id is a
 * well-formed fake UUID that the action href helper reads from.
 *
 * Cases: 15 total
 *   - 13 types from NOTIFICATION_ACTIONS (excluding booking_completed which splits)
 *   - booking_completed × couple  → Leave Review
 *   - booking_completed × vendor  → View booking
 *
 * Cleanup: afterEach deletes both seeded users. ON DELETE CASCADE covers
 * notifications. The spec also deletes leftover notification rows by user_id
 * before user deletion to avoid FK timing issues.
 */

import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';
import type { Database } from '../../src/types/database.types';

// ─── constants ────────────────────────────────────────────────────────────────

/**
 * A well-formed UUID used as the fake booking_id in all notification metadata.
 * No real booking row needs to exist — the href is computed from metadata only.
 */
const FAKE_BOOKING_ID = '00000000-0000-0000-0000-000000000099';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Insert a notification row via service-role (bypasses RLS). */
async function seedNotification(
  userId: string,
  type: Database['public']['Tables']['notifications']['Insert']['type'],
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title: `Test: ${type}`,
      body: 'Seeded for action-buttons spec',
      link: `/dashboard/bookings/${FAKE_BOOKING_ID}`,
      metadata: { booking_id: FAKE_BOOKING_ID, ...metadata },
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedNotification(${type}): ${error.message}`);
  return data.id;
}

/** Delete all notifications for a user (belt-and-suspenders before user delete). */
async function cleanupNotifications(userId: string) {
  const sb = getServiceClient();
  await sb.from('notifications').delete().eq('user_id', userId);
}

/** Dismiss the "Welcome to Baazar" onboarding modal if it appears. */
async function dismissWelcomeModal(page: import('@playwright/test').Page) {
  const skipBtn = page.getByRole('button', { name: /skip for now/i });
  const isVisible = await skipBtn.isVisible({ timeout: 1_500 }).catch(() => false);
  if (isVisible) {
    await skipBtn.click({ force: true });
    await page
      .locator('div[data-state="open"][aria-hidden="true"]')
      .waitFor({ state: 'hidden', timeout: 3_000 })
      .catch(() => {});
  }
}

// ─── case table ───────────────────────────────────────────────────────────────
//
// Primary action is always allActions[0] (NotificationCard renders slice(0,1) in dropdown).
// Labels + href suffixes are read verbatim from src/components/notifications/actions.ts.
//
// hrefSuffix = undefined → View-booking: href has NO ?action= query param.

interface Case {
  type: Database['public']['Tables']['notifications']['Insert']['type'];
  actor: 'couple' | 'vendor';
  primaryLabel: string;
  /** Expected ?action=X suffix, or undefined for plain View-booking links. */
  actionSuffix?: string;
  /** Extra metadata to include (only used for booking_completed role discrimination). */
  extraMeta?: Record<string, unknown>;
}

const CASES: Case[] = [
  // booking_request_received → vendor → Accept
  {
    type: 'booking_request_received',
    actor: 'vendor',
    primaryLabel: 'Accept',
    actionSuffix: 'accept',
  },

  // vendor_accepted → couple → Pay Deposit
  {
    type: 'vendor_accepted',
    actor: 'couple',
    primaryLabel: 'Pay Deposit',
    actionSuffix: 'pay-deposit',
  },

  // vendor_adjusted_quote → couple → Accept
  {
    type: 'vendor_adjusted_quote',
    actor: 'couple',
    primaryLabel: 'Accept',
    actionSuffix: 'accept',
  },

  // couple_countered → vendor → Accept
  {
    type: 'couple_countered',
    actor: 'vendor',
    primaryLabel: 'Accept',
    actionSuffix: 'accept',
  },

  // couple_accepted_adjusted → vendor → View booking (secondary, no query)
  {
    type: 'couple_accepted_adjusted',
    actor: 'vendor',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // couple_declined_adjusted → vendor → View booking (secondary, no query)
  {
    type: 'couple_declined_adjusted',
    actor: 'vendor',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // deposit_paid → vendor → View booking (secondary, no query)
  {
    type: 'deposit_paid',
    actor: 'vendor',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // booking_confirmed → couple → View booking (secondary, no query)
  {
    type: 'booking_confirmed',
    actor: 'couple',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // booking_auto_cancelled → couple (either side fine; couple chosen) → View booking
  {
    type: 'booking_auto_cancelled',
    actor: 'couple',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // booking_cancelled → couple → View booking
  {
    type: 'booking_cancelled',
    actor: 'couple',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // event_completed → couple → View booking (primary variant in actions.ts)
  {
    type: 'event_completed',
    actor: 'couple',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
  },

  // booking_completed (couple) → Leave Review
  {
    type: 'booking_completed',
    actor: 'couple',
    primaryLabel: 'Leave Review',
    actionSuffix: 'leave-review',
    extraMeta: { recipient_role: 'couple' },
  },

  // booking_completed (vendor) → View booking (role-discriminated in getActionsFor)
  {
    type: 'booking_completed',
    actor: 'vendor',
    primaryLabel: 'View booking',
    actionSuffix: undefined,
    extraMeta: { recipient_role: 'vendor' },
  },

  // review_received → vendor → View Review
  {
    type: 'review_received',
    actor: 'vendor',
    primaryLabel: 'View Review',
    actionSuffix: 'view-review',
  },

  // custom_request_received → vendor → Send Quote
  {
    type: 'custom_request_received',
    actor: 'vendor',
    primaryLabel: 'Send Quote',
    actionSuffix: 'send-quote',
  },
];

// ─── spec ─────────────────────────────────────────────────────────────────────

test.describe('D.1 — action buttons render correctly per notification type', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    // Delete notification rows before user deletion (belt-and-suspenders).
    if (couple) await cleanupNotifications(couple.id).catch(() => {});
    if (vendor) await cleanupNotifications(vendor.id).catch(() => {});
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  for (const c of CASES) {
    // Test name: "booking_completed (vendor) → View booking"
    const roleSuffix = c.type === 'booking_completed' ? ` (${c.actor})` : '';
    const testName = `${c.type}${roleSuffix} → primary action "${c.primaryLabel}"`;

    test(testName, async ({ browser }) => {
      test.setTimeout(90_000);

      couple = await seedCouple();
      vendor = await seedVendor({ chargesEnabled: false });

      const userId = c.actor === 'couple' ? couple.id : vendor.id;
      const metadata: Record<string, unknown> = { ...(c.extraMeta ?? {}) };

      // Sign in as the recipient role BEFORE seeding the notification.
      // Once the page is loaded and the Supabase realtime channel is subscribed,
      // we seed the notification. The realtime INSERT event updates the bell badge
      // without requiring a page reload — more reliable than seeding before load.
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginAs(page, c.actor === 'couple' ? couple : vendor);

      try {
        // loginAs lands on /dashboard. Wait for networkidle to ensure the
        // Navbar's client-side auth + NotificationBell have fully initialized
        // (including the realtime channel subscription).
        await page.waitForLoadState('networkidle');
        await dismissWelcomeModal(page);

        // Seed the notification NOW — realtime subscription will pick it up.
        await seedNotification(userId, c.type, metadata);

        // ── Open the bell dropdown ────────────────────────────────────────────
        // Bell aria-label: "Notifications (N unread)" when N > 0.
        // The realtime INSERT updates the badge within a few seconds.
        // We wait up to 20 s for the badge to appear.
        const bellWithUnread = page.getByRole('button', {
          name: /Notifications \(\d+ unread\)/i,
        });
        const plainBell = page.getByRole('button', { name: /^Notifications$/i });

        const bellVisible = await bellWithUnread
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => true)
          .catch(() => false);

        if (bellVisible) {
          await bellWithUnread.click({ force: true });
        } else {
          // Realtime may be slow — fall back to page reload so the initial fetch picks it up.
          await page.reload({ waitUntil: 'networkidle' });
          await dismissWelcomeModal(page);

          const bellAfterReload = await bellWithUnread
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => true)
            .catch(() => false);

          if (bellAfterReload) {
            await bellWithUnread.click({ force: true });
          } else {
            // Last resort: try plain bell (no unread badge — maybe already marked read?)
            const plainVisible = await plainBell
              .waitFor({ state: 'visible', timeout: 5_000 })
              .then(() => true)
              .catch(() => false);
            if (plainVisible) {
              await plainBell.click({ force: true });
            } else {
              throw new Error(
                `Bell button not visible for type=${c.type} actor=${c.actor}. ` +
                  `Check that the seeded user sees notifications.`
              );
            }
          }
        }

        // ── Assert primary action link label ──────────────────────────────────
        // NotificationCard renders action buttons as <Link> elements inside an
        // outer <Link> card wrapper. Because the outer card's accessible name
        // includes the inner action text, getByRole('link',{name}) can match the
        // outer card first. We scope to the action-button div (class="mt-2 flex
        // flex-wrap gap-2") so we only match the actual action buttons.
        const actionButtonsContainer = page.locator('.mt-2.flex.flex-wrap.gap-2').first();
        const actionLink = actionButtonsContainer.getByRole('link', {
          name: c.primaryLabel,
        });
        await expect(
          actionLink,
          `[${c.type}] primary action link "${c.primaryLabel}" must be visible in dropdown`
        ).toBeVisible({ timeout: 6_000 });

        // ── Assert href ───────────────────────────────────────────────────────
        const href = await actionLink.getAttribute('href');
        expect(
          href,
          `[${c.type}] href must contain /dashboard/bookings/${FAKE_BOOKING_ID}`
        ).toContain(`/dashboard/bookings/${FAKE_BOOKING_ID}`);

        if (c.actionSuffix !== undefined) {
          expect(href, `[${c.type}] href must contain ?action=${c.actionSuffix}`).toContain(
            `?action=${c.actionSuffix}`
          );
        } else {
          // View-booking: no ?action= query param
          expect(href, `[${c.type}] View-booking href must NOT contain ?action=`).not.toContain(
            '?action='
          );
        }
      } finally {
        await ctx.close();
      }
    });
  }
});
