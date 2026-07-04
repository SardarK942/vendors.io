# Sidebar redesign + Settings page — design

Date: 2026-07-03
Status: approved for implementation

## Summary

Two paired changes to the vendor + couple dashboard:

1. **Redesign `SidebarNav`** on top of shadcn's `Sidebar` primitives. Adds a business-name header (vendor role), a haldi-highlighter treatment on every workspace page's title, and a proper user card in the footer with a Profile / Log out dropdown.
2. **Add a Settings page** at `/dashboard/settings` with two forms — password change and email change. This is the first account-level surface the app has had; today users can't reset their password without the email flow.

Both land in a single PR. No migrations. No feature flags.

## Goals

- Vendor gets a persistent "you're operating on Meera's Mehndi Studio" identity anchor at the top of every dashboard page without opening the top nav.
- Every dashboard page title (`Home`, `Bookings`, `Calendar`, `Packages`, `Business Analytics`, `Profile`, `Settings`) gets the same haldi-highlighter treatment, giving the workspace a coherent color rhythm.
- Users can change their password from inside the app.
- Users can update their sign-in email through Supabase's built-in confirm-both-emails flow.
- Sidebar uses shadcn primitives so we get the collapsible desktop rail + mobile drawer for free instead of maintaining the current hand-rolled `Sheet` wiring in `layout.tsx`.

## Non-goals

- **Notification preferences.** Reviewed the 14 `NotificationType` values — 13 are transactional (booking flow, deposit, quote, completion) and must always email. Only `review_received` is arguably muteable. Not worth a UI + settings model for one toggle. Revisit when we ship real muteable emails (weekly summaries, feature announcements, vendor spotlights).
- **Delete account.** Danger-zone flow with cascade decisions (vendor_profiles, bookings, saved). Deserves its own spec.
- **Theme toggle, avatar upload, 2FA, i18n prefs.** Not on the roadmap.
- **Redesigning `BaazarChrome` / `StaggeredMenu`.** Top nav stays untouched. Sidebar business-name is display-only; the existing `BusinessSwitcher` in `BaazarChrome` still owns switching.

## Section 1 — Sidebar architecture

### Structure

Built on `npx shadcn@latest add sidebar`, which drops a `src/components/ui/sidebar.tsx` full of composable primitives. We compose them into a single `SidebarNav` client component:

```
<SidebarProvider>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <VendorBusinessAnchor />        (vendor role only — business name + verified pill + city)
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarMenu>
          {workspaceLinks.map(...)}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>                  (indigo-tinted divider above via border-top)
        <SidebarGroupLabel>Account</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>Settings</SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <SidebarUserMenu />              (avatar + name + email + chevron; dropdown holds Profile + Log out)
    </SidebarFooter>
  </Sidebar>
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>
```

### Behavior

- **Desktop**: fixed-open at ~264 px. Uses shadcn's `collapsible="icon"` so users can toggle to an icon-only rail via the built-in `SidebarTrigger`.
- **Mobile**: shadcn's built-in mobile drawer replaces the manual `Sheet` wiring currently in `src/app/dashboard/layout.tsx`.
- **Active-link detection**: reuse the existing `isActive` logic from the old `SidebarNav` (path startsWith + carve-out so `/dashboard/profile/setup/*` lights up Profile, not Home). That logic is already correct.

### Link list per role

| Section            | Vendor | Couple |
| ------------------ | ------ | ------ |
| Home               | ✓      | ✓      |
| Bookings           | ✓      | ✓      |
| Saved              |        | ✓      |
| Notifications      | ✓      | ✓      |
| Calendar           | ✓      |        |
| Packages           | ✓      |        |
| Business Analytics | ✓      |        |
| Profile            | ✓      |        |
| Settings (new)     | ✓      | ✓      |

Couples don't get the `SidebarHeader` — no business identity to anchor. The rest of the shell is identical.

### Palette hookup

shadcn's `Sidebar` reads its colors from CSS variables (`--sidebar-background`, `--sidebar-foreground`, `--sidebar-accent`, etc.). Map them to our locked Baazar tokens in `src/app/globals.css`:

```css
--sidebar-background: color-mix(in srgb, hsl(var(--cream-soft)) 60%, hsl(var(--cream)));
--sidebar-foreground: hsl(var(--ink));
--sidebar-accent: color-mix(in srgb, hsl(var(--indigo)) 12%, transparent);
--sidebar-accent-foreground: hsl(var(--ink));
--sidebar-border: hsl(var(--hairline));
--sidebar-ring: hsl(var(--indigo));
```

No visual drift from the existing design system.

### Where haldi lands

Two placements, max 2 haldi per view (per DESIGN.md rule):

1. **Page title on every dashboard page.** The `<PageTitle>` component (new — see file list) wraps every dashboard-tree page's heading in the solid haldi block treatment (homepage "Cultural" pattern scaled to fit the title text). Applies to `/dashboard`, `/dashboard/bookings`, `/dashboard/notifications`, `/dashboard/saved`, `/dashboard/profile/calendar`, `/dashboard/profile/packages`, `/dashboard/money`, `/dashboard/profile`, `/dashboard/settings`. Does NOT apply to nested sub-pages (e.g., `/dashboard/bookings/[id]`, `/dashboard/profile/packages/new`) — those keep their existing titles so the yellow keeps its top-level-page signal.
2. **Bookings counter in the sidebar** — a soft haldi pill on the Bookings nav row, showing a "needs your action" count. Query varies by role:
   - **Vendor:** `SELECT count(*) FROM bookings WHERE vendor_profile_id = activeBusinessId AND status = 'pending_quote'`. Same semantic as `InboxRow`'s "Needs quote" chip.
   - **Couple:** `SELECT count(*) FROM bookings WHERE couple_user_id = me AND status IN ('accepted', 'adjusted_quote_sent')`. `accepted` = vendor accepted, awaiting deposit ("Awaiting deposit" per `EventCard`). `adjusted_quote_sent` = vendor sent an adjusted quote, awaiting couple response (accept / decline / counter).

   Hidden at zero for both roles.

Nothing in Settings, nothing in the profile subpages. Yellow stays scarce so it keeps its signal.

### Other color choices

- **Verified pill** in the sidebar header uses an indigo-tinted pill (`bg-indigo/10 border-indigo/20 text-indigo`) matching the HV-B verified pattern from DESIGN.md.
- **Hot-pink unread dot** on the sidebar's Notifications nav row when the current user has any unread rows in the `notifications` table. Different signal from haldi ("needs your action") vs hot pink ("there's news").
- **Indigo-tinted hairline** between the Workspace and Account sidebar groups. Subtle structural color.
- **Indigo accent rail** on the left edge of Settings cards. Matches existing card patterns elsewhere in the dashboard.

### Files touched

**New:**

- `src/components/ui/sidebar.tsx` — shadcn CLI-generated. Do not hand-edit.
- `src/components/dashboard/sidebar/VendorBusinessAnchor.tsx` (~40 lines) — server component fetches active business name + verified state + city.
- `src/components/dashboard/sidebar/SidebarUserMenu.tsx` (~60 lines) — client component; wraps a shadcn `DropdownMenu` around the user card.

**Modified:**

- `src/components/dashboard/SidebarNav.tsx` — rewritten (~120 lines) to compose the shadcn primitives with the role-driven link list.
- `src/app/dashboard/layout.tsx` — drop the manual `Sheet` + `<aside>`; wrap children in `SidebarProvider` and `SidebarInset`. Threads active business data down into `VendorBusinessAnchor`.
- `src/app/globals.css` — add the `--sidebar-*` token mappings.
- Every `src/app/dashboard/**/page.tsx` — swap `<h1 className="text-2xl font-semibold">` (or whatever the current title treatment is per page) to `<PageTitle>Home</PageTitle>` — a new small component (see below).

**New (shared title component):**

- `src/components/dashboard/PageTitle.tsx` (~15 lines) — `<h1>` with the haldi block treatment. Single source for the styling so we don't scatter Tailwind classes across every page.

## Section 2 — Settings page

### Routes

Single subpage:

```
/dashboard/settings   →  renders both forms stacked in cards
```

No layout.tsx yet. No tab-nav yet. When we add a second subpage later (Notifications, Billing, Team), we add tabs then.

### Password change card

- **Fields**: `current_password`, `new_password` (min 8), `confirm_new_password`.
- **Handler**: re-authenticate with `supabase.auth.signInWithPassword({ email, password: current_password })` to verify the current password (Supabase doesn't require it on `updateUser`, but we do for safety). Then `supabase.auth.updateUser({ password: new_password })`.
- **Success**: `toast.success('Password updated')`, form resets.
- **Errors**: wrong current password → toast "Current password is incorrect." Mismatch → toast "New passwords don't match."

### Email change card

- **Field**: `new_email`.
- **Handler**: `supabase.auth.updateUser({ email: new_email })`. Supabase sends confirmation links to both the old and the new email; the change takes effect once both are clicked.
- **UI on submit**: form disables; a callout appears — "Heads up — we'll send confirmation links to both your old and new email. The change takes effect once both are clicked."

### Data model

No schema changes. Supabase auth handles password + email storage.

### Files touched

**New:**

- `src/app/dashboard/settings/page.tsx` (~30 lines) — server component; renders both form cards stacked.
- `src/components/settings/PasswordChangeForm.tsx` (~90 lines) — client component with react-hook-form / zod (or matching the app's existing form pattern).
- `src/components/settings/EmailChangeForm.tsx` (~60 lines).
- `src/app/api/settings/password/route.ts` (~50 lines) — POST; re-auths + updates.
- `src/app/api/settings/email/route.ts` (~30 lines) — POST; updates.

## Section 3 — PR split + rollout

### Branch

`feat/sidebar-shadcn-plus-settings` (this branch — spec commit lands here first).

### PR title

`feat(dashboard): shadcn Sidebar redesign + Settings (password + email)`

### PR body

- Summary: sidebar redesign + settings page.
- Before/after screenshots at three states: vendor default, vendor collapsed, couple.
- Settings page screenshot (both forms visible).
- Link back to this spec.
- Test plan checklist.

### Verification before merge

Follows the same pattern used for PRs #95 and the calendar-feed work: temp preview page + Playwright smoke, screenshots pulled with chrome-devtools, temp files removed before commit.

**Manual checks:**

1. Sidebar renders correctly at three role/state combinations (vendor default, vendor collapsed rail, couple).
2. Active-link state matches current logic — visit `/dashboard/profile/setup/basics` → Profile is active, not Home.
3. Password change: wrong current → toast error; correct current + valid new → toast success + form resets.
4. Email change: submit → confirmation-state UI appears.
5. Mobile drawer opens via hamburger + closes on route change.
6. Haldi placement: page title always visible; sidebar Bookings counter only when there are `pending_quote` items.
7. Hot-pink unread dot on Notifications only when there are unread notifications.

**Playwright specs (kept, not throwaway):**

- `tests/e2e/sidebar-vendor.spec.ts` — vendor sidebar renders + Settings link routes correctly.
- `tests/e2e/sidebar-couple.spec.ts` — couple sidebar renders without vendor-only links.
- `tests/e2e/settings-password.spec.ts` — password change happy path + wrong-password error.

Skipping an email-change spec — it requires Supabase to actually send confirmation emails, out of scope for local e2e.

### Rollout

- Merge to main → Vercel auto-deploys to prod.
- No migration; no prod DB changes.
- Zero-risk if the Playwright specs pass — behavior is additive; the only removed surface is the old `SidebarNav` implementation, which is drop-in replaced.

## Open questions

None — all decisions locked with the user during brainstorm (2026-07-03 session).
