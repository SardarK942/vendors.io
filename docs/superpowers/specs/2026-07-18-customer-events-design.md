# Customer Events + Event Journal — Design Spec (Phase 1)

**Date:** 2026-07-18
**Branch:** `feat/customer-events` (off main @ `2d77712`)
**Status:** Approved design, pending implementation plan

## Summary

Couples can create an **Event** (a celebration, e.g. "Mustafa & Ayesha's Wedding") composed of multiple **functions** (Mehndi, Nikah, Shaadi, Reception…). Each function carries its own date, venue, guest estimate, and — the core of the feature — its own **vendor-needs checklist**. Bookings made on Baazar link to a function and automatically fill the matching vendor slot in the couple's **event journal**; vendors booked off-platform can be added manually. The journal also tracks a celebration-level budget with computed per-function/per-category rollups, a todo list with due-date reminders, and days-to-go countdowns.

Inspiration: WeddingSuite onboarding + dashboard screenshots (2026-07-18), adapted to cultural multi-day weddings, Baazar's 13 vendor categories, and Baazar's design system.

### Phasing (decided)

| Phase             | Scope                                                                                                    | Status    |
| ----------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| **1 (this spec)** | Event wizard + journal: functions, vendor needs, budget, tasks, reminders, booking links, manual vendors | Designing |
| 2                 | Guest households + public RSVP page (`event_guests`, `events.rsvp_slug`)                                 | Later PR  |
| 3                 | Seating chart (hangs off `event_functions`)                                                              | Later PR  |

Phase 1 schema deliberately anchors phases 2–3 (see §1).

## Decisions log

- **Event shape:** celebration container + functions. Single-day event = one function.
- **Everything plannable is function-based** — vendor needs belong to a function ("henna artist for Mehndi day, not Shaadi day").
- **Budget:** one total at celebration level; committed spend rolls up per function AND per category automatically. Optional planned per-category allocations (wizard slider step) at celebration level. No hard per-function budgets.
- **"Spent" = committed total:** Σ linked bookings' `total_price_cents` + Σ manual vendor amounts. (Not deposits-paid.)
- **Wizard entry:** full-screen wizard at `/dashboard/events/new`; signup onboarding unchanged.
- **Task reminders:** optional due dates + daily cron → due-soon/overdue notifications + countdown milestone pings.
- **Registry-first components:** search shadcn + 21st.dev registries (shadcn MCP) before writing any component from scratch; hand-roll only when nothing fits. Restyle with Baazar tokens.
- **Neutral voice:** no religious-specific greetings or copy anywhere in the UI, notifications, or emails ("Salaam" → "Hello"). Cultural event-type/function names (Nikah, Mehndi, Katb el-Kitab…) are product taxonomy and stay.

## 1. Data model — migration `00072_customer_events.sql`

Five new tables + one FK on `bookings`. All timestamps `timestamptz default now()`; all PKs `uuid default gen_random_uuid()`.

### `events`

| column                      | type                                    | notes                                                   |
| --------------------------- | --------------------------------------- | ------------------------------------------------------- |
| `id`                        | uuid PK                                 |                                                         |
| `couple_user_id`            | uuid FK → `users(id)` on delete cascade | owner                                                   |
| `name`                      | text not null                           | e.g. "Mustafa & Ayesha's Wedding"                       |
| `celebration_type`          | text not null                           | `EventTypeId` (e.g. `wedding`, `aqiqah`); app-validated |
| `city`                      | text                                    |                                                         |
| `total_budget_cents`        | bigint                                  | nullable = no budget set                                |
| `notes`                     | text                                    | free-form couple notes                                  |
| `created_at` / `updated_at` | timestamptz                             |                                                         |

Phase 2 will add `rsvp_slug`, guest tables keyed on `events.id`. Phase 3 keys seating on `event_functions.id`.

### `event_functions`

| column                    | type                                 | notes                                                          |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `id`                      | uuid PK                              |                                                                |
| `event_id`                | uuid FK → `events` on delete cascade |                                                                |
| `sequence`                | int not null                         | display order; unique `(event_id, sequence)`                   |
| `label`                   | text not null                        | display name, e.g. "Mehndi"                                    |
| `event_type_id`           | text                                 | from `EVENT_TYPES` (`src/types/index.ts`); nullable for custom |
| `date`                    | date                                 | nullable = not decided yet                                     |
| `start_time` / `end_time` | time                                 | nullable                                                       |
| `venue_name`              | text                                 |                                                                |
| `city`                    | text                                 | falls back to event city in UI                                 |
| `guest_estimate`          | int                                  |                                                                |
| `notes`                   | text                                 |                                                                |

### `event_vendor_needs`

One row = one vendor slot for one function.

| column                      | type                                          | notes                                                                        |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `id`                        | uuid PK                                       |                                                                              |
| `event_function_id`         | uuid FK → `event_functions` on delete cascade |                                                                              |
| `category`                  | text not null                                 | vendor category slug (13 canonical, `content_creation` incl.); app-validated |
| `booking_id`                | uuid FK → `bookings` on delete **set null**   | linked Baazar booking                                                        |
| `manual_vendor_name`        | text                                          | off-platform vendor                                                          |
| `manual_amount_cents`       | bigint                                        |                                                                              |
| `manual_booked`             | boolean default false                         | true = booked off-platform                                                   |
| `notes`                     | text                                          |                                                                              |
| `sort`                      | int default 0                                 |                                                                              |
| `created_at` / `updated_at` |                                               |                                                                              |

**Status is derived, never stored:**

1. `booking_id` set AND booking status ∉ {cancelled, expired, declined} → **booked via Baazar**
2. else `manual_booked` → **booked off-platform**
3. else → **needed**

A cancelled booking therefore auto-reverts its slot to "needed" with no sync logic. A slot may hold `booking_id` _or_ manual fields; if a manual slot later gets a Baazar booking linked, booking wins for status/spend and manual fields are cleared by the linking action.

**Committed spend per slot** = linked booking's `total_price_cents` (when status-active) else `manual_amount_cents` (when `manual_booked`) else 0. Rollups group by function (via `event_function_id`) and by `category`.

### `event_budget_allocations`

| column          | type                                 | notes                         |
| --------------- | ------------------------------------ | ----------------------------- |
| `id`            | uuid PK                              |                               |
| `event_id`      | uuid FK → `events` on delete cascade |                               |
| `category`      | text not null                        | unique `(event_id, category)` |
| `planned_cents` | bigint not null                      |                               |

### `event_tasks`

| column                                         | type                                               | notes           |
| ---------------------------------------------- | -------------------------------------------------- | --------------- |
| `id`                                           | uuid PK                                            |                 |
| `event_id`                                     | uuid FK → `events` on delete cascade               |                 |
| `event_function_id`                            | uuid FK → `event_functions` on delete **set null** | optional tag    |
| `title`                                        | text not null                                      |                 |
| `due_date`                                     | date                                               | nullable        |
| `completed_at`                                 | timestamptz                                        | nullable        |
| `due_soon_notified_at` / `overdue_notified_at` | timestamptz                                        | reminder dedupe |
| `sort`                                         | int default 0                                      |                 |
| `created_at` / `updated_at`                    |                                                    |                 |

### `bookings`

- Add `event_function_id` uuid nullable FK → `event_functions(id)` on delete set null.

### RLS

- `events`: all ops where `couple_user_id = auth.uid()`.
- Child tables (`event_functions`, `event_vendor_needs`, `event_budget_allocations`, `event_tasks`): all ops where owning `event_id` belongs to `auth.uid()` (join through parent for `event_vendor_needs`).
- No vendor-facing policies. Service role used by the reminder cron.
- `database.types.ts`: hand-patch new tables/columns per [[database-types-regen-cleanup-pending]] policy (no clean regen).

## 2. Event-creation wizard — `/dashboard/events/new`

Full-screen route (couple-only, no dashboard sidebar), 5 steps, cream canvas, ink primary CTAs, DM Mono step kickers, back/next + `Skip for now` on steps 2–5. State held client-side; **one server action on finish** writes event + functions + needs + allocations + tasks atomically (single RPC or sequenced inserts w/ rollback).

1. **Basics** _(required)_ — name (prefilled from couple's profile name + "…'s Wedding") and celebration type (`EventTypePicker` groups) required; city optional.
2. **Functions & days** — preset chips: Mehndi, Sangeet, Nikah, Baraat, Shaadi, Walima, Reception, Katb el-Kitab, Laylat al-Henna, Zaffa, Engagement, + custom label. Selected chips become an editable ordered list: date (optional), guest estimate (optional). At least one function enforced (skip → single function named after celebration type).
3. **Vendors needed, per function** — for each function, category chips from `CATEGORIES_FEATURED` with per-function-type smart defaults pre-checked (e.g. Mehndi → `mehndi`, `decor`, `catering`; Shaadi → `venue`, `photography`, `catering`, `dj`). Each checked chip exposes an "Already booked?" toggle → inline `name` + `amount` fields = manual vendor row.
4. **Budget** — total input + suggested per-category allocation sliders (inspo-style; allocations optional, celebration-level, seeded proportional to a default split across the categories selected in step 3).
5. **Checklist starter** — auto-suggested task chips from unbooked needs ("Book henna artist for Mehndi"), misc presets (outfits, invitations…), add-your-own; optional due date per task.

Finish → redirect to journal. Wizard is re-usable for additional celebrations.

## 3. Event journal — `/dashboard/events/[id]`

Couple-only server page + client panels:

- **Hero** (ink card): name, date range (min–max function dates), city, **days-to-go** to next upcoming function, compact budget line (total · committed · remaining).
- **Function timeline**: horizontal scroll cards — label, date, venue, per-function countdown, "3 of 5 vendors booked" progress.
- **Vendor board** (centerpiece): grouped by function. Each slot: category icon + derived status badge. Needed → **"Find {category} vendors"** deep-link to marketplace pre-filtered (category + city). Booked via Baazar → vendor name, price, link to `/dashboard/bookings/…`. Off-platform → name, amount, edit/delete. `+ Add vendor` per function: link an existing unlinked booking (picker) OR manual entry form. Slots addable/removable anytime.
- **Budget panel**: committed vs total bar; tabs By function / By category (computed rollups); planned-allocation comparison rows where allocations exist (over-planned badge).
- **Tasks panel**: overdue → due-soon → rest; check-off, add/edit task (title, due date, function tag), delete.
- **Notes**: simple editable notes on event (and per function via function card).
- `/dashboard/events` — list of the couple's events (cards w/ countdown + progress) + "Plan a celebration" CTA. Zero events → wizard invite empty state.

## 4. Booking-flow integration

Both entry points (`BookingForm` → `/api/bookings`, `CustomRequestForm` → `/api/bookings/custom-request`):

- If couple has ≥1 event: selector "Which event is this for?" — event → function (defaults to sole event; function list w/ dates), plus "Not for an event". If zero events: subtle "＋ Set up your event" link to wizard (no selector).
- On submit (server side, in `createBooking` / custom-request handler): set `bookings.event_function_id`; **upsert** `event_vendor_needs` — if a slot with that function + vendor's category exists and is unfilled, link it (clearing manual fields); else create a new slot with `booking_id`.
- Journal supports retroactive linking for pre-existing bookings (unlinked-booking picker sets `event_function_id` + upserts slot identically — shared service function `linkBookingToFunction`).

## 5. Reminders & notifications

- New `NotificationType` values: `event_task_due`, `event_task_overdue`, `event_countdown` (enum migration piece + union in `database.types.ts` + helpers in `notifications.service.ts` + copy/rendering in `NotificationCard` + priority mapping).
- Delivery: existing bell/dropdown + Resend email path (`lib/notifications/deliver.ts`).
- **Daily cron** (GitHub Actions scheduled workflow, scraper pattern) hits `POST /api/cron/event-reminders` guarded by `CRON_SECRET`:
  - tasks due within 3 days & not completed & `due_soon_notified_at is null` → `event_task_due`, stamp.
  - tasks past due & not completed & `overdue_notified_at is null` → `event_task_overdue`, stamp.
  - functions with date exactly 30/14/7/1 days out → `event_countdown` ("Mehndi is 7 days away — 2 vendor slots still open").
- Route uses service role; idempotent per day via the stamp columns / exact-day matches.

## 6. Navigation & dashboard changes

- `SidebarNav` couple links: add **My Event** → `/dashboard/events` (top of workspace group).
- `/dashboard` home (couple branch): zero events → "Plan your celebration" hero card above bookings grid; ≥1 event → compact journal summary card (countdown · budget bar · next 3 tasks → journal link). Existing `CustomerWelcomeBanner` logic untouched.

## 7. Component sourcing (rule)

Registry-first: search shadcn + 21st.dev registries via the shadcn MCP before authoring any component (stepper, sliders, progress ring, timeline, checklist, empty states). Compose registry items, restyle with Baazar tokens per DESIGN.md (palette M+, TY-C type, ink CTAs, ≤2 haldi accents/page). Hand-roll only when the registry has nothing fitting (expected: vendor-needs board arrangement, hero). Do not vendor parallel component libraries (per date-picker deferral decision, no Untitled UI `base/`).

## 8. Error handling

- Wizard finish action: atomic write; on failure, surface toast + keep client state (no partial event).
- Booking submit with event link: booking creation must not fail because slot upsert failed — link/upsert wrapped so a slot error logs + degrades (booking still created; journal offers retroactive link).
- Deleting a function: cascade deletes its slots/tasks tags; linked bookings keep existing (FK set null). Confirm dialog spells this out.
- Deleting an event: cascade; bookings unlinked (set null), never deleted. Confirm dialog.
- Cron: per-item try/catch; one bad row doesn't halt the run.

## 9. Testing

- **Unit:** derived-status logic; committed-spend rollups (booking-linked, manual, cancelled-booking reversion); reminder selection queries (due-soon/overdue/milestone, dedupe stamps).
- **RLS:** couple A cannot read/write couple B's event graph; vendors cannot read any.
- **E2E (Playwright, aligned to current UI so they pass):** wizard happy path → journal renders functions/slots/tasks; book a vendor with event selector → slot flips to booked; manual vendor add; task check-off.
- CI must be fully green before merge (merge rule), acknowledging the legacy-spec breakage tracked separately — new specs must pass.

## 10. Rollout

- One PR: `feat/customer-events` → main (squash). Migration `00072` applied to dev by Claude, prod by user (policy).
- Cron workflow file lands in same PR; needs `CRON_SECRET` + app URL as GH secrets before first run.
- No changes to vendor-facing surfaces; legacy booking flow works unchanged when couples skip event linking.
