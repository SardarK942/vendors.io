# Sidebar Redesign + Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `SidebarNav` on top of the shadcn `Sidebar` primitives, land a shared `<PageTitle>` haldi-block treatment on every top-level dashboard page, and add a `/dashboard/settings` route with password + email change forms.

**Architecture:** One PR on branch `feat/sidebar-shadcn-plus-settings`. Server component (`layout.tsx`) fetches active business + sidebar counts once, hands them to a client `SidebarNav` composed of shadcn primitives. Settings page uses the app's existing controlled-state + FormData + fetch form pattern (matches `PackageEditorForm`), with two thin API routes that wrap Supabase auth calls.

**Tech Stack:** Next.js 14 (App Router, RSC), TypeScript, Tailwind, shadcn/ui, Supabase (auth + Postgres), Vitest + @testing-library, Playwright.

## Global Constraints

- **Branch:** `feat/sidebar-shadcn-plus-settings` (already exists off `main`, spec commit `ecd3466` is HEAD). Every task's commit lands here.
- **No migrations.** No prod DB changes.
- **Palette locked to Baazar tokens.** cream `#FBF6EC`, indigo `#2E3DA3`, ink `#1B1414`, hot-pink `#D1006C`, haldi `#F2B92E`, hairline `#E8DFC8`. All new color choices reuse existing Tailwind classes (`bg-cream`, `text-ink`, `bg-haldi`, `bg-indigo/[.08]`, `text-hot-pink`, `border-hairline`).
- **Max 2 haldi elements per view.** Page title (always) + Bookings counter (conditional). Never more.
- **Form pattern:** controlled `useState` + `new FormData(e.currentTarget)` + `fetch()` + `sonner` `toast`. Same shape as `src/components/forms/PackageEditorForm.tsx`. Do not introduce react-hook-form / zod resolvers.
- **Testing split:** Vitest for services + API routes (existing pattern under `src/__tests__/`), Playwright for user-facing behavior (existing pattern under `tests/e2e/`). No RTL-based component tests unless a task explicitly says so.
- **Preserve** the `panel` parallel-route slot in `src/app/dashboard/layout.tsx`. `BaazarChrome` stays untouched.
- **Preserve** the existing `isActive` logic in `SidebarNav` (path startsWith + `/dashboard/profile/setup/*` → Profile carve-out).
- **Commit each task separately.** Message format `feat(...)`, `test(...)`, `chore(...)` matching existing history.
- **No trailing summaries in code comments.** Only comment when the _why_ is non-obvious.
- **Aliases:** `@/` maps to `src/`.

---

## File Structure

**New:**

- `src/components/ui/sidebar.tsx` — shadcn CLI generated (Task 1). Do not hand-edit.
- `src/components/dashboard/PageTitle.tsx` — shared haldi-block `<h1>` (Task 2).
- `src/components/dashboard/sidebar/VendorBusinessAnchor.tsx` — server component (Task 5).
- `src/components/dashboard/sidebar/SidebarUserMenu.tsx` — client component with DropdownMenu (Task 6).
- `src/lib/dashboard/sidebar-counts.ts` — role-aware count queries (Task 4).
- `src/app/dashboard/settings/page.tsx` — server component composing both forms (Task 11).
- `src/components/settings/PasswordChangeForm.tsx` — client form (Task 9).
- `src/components/settings/EmailChangeForm.tsx` — client form (Task 10).
- `src/app/api/settings/password/route.ts` — POST handler (Task 9).
- `src/app/api/settings/email/route.ts` — POST handler (Task 10).
- `src/__tests__/components/dashboard/PageTitle.test.tsx` (Task 2).
- `src/__tests__/lib/sidebar-counts.test.ts` (Task 4).
- `src/__tests__/api/settings-password.test.ts` (Task 9).
- `src/__tests__/api/settings-email.test.ts` (Task 10).
- `tests/e2e/sidebar-vendor.spec.ts` (Task 12).
- `tests/e2e/sidebar-couple.spec.ts` (Task 12).
- `tests/e2e/settings-password.spec.ts` (Task 12).

**Modified:**

- `src/app/globals.css` — add `--sidebar-*` CSS var mappings (Task 1).
- `src/components/dashboard/SidebarNav.tsx` — full rewrite (Task 7).
- `src/app/dashboard/layout.tsx` — `SidebarProvider` + `SidebarInset` + counts + business anchor threading (Task 8).
- `src/app/dashboard/page.tsx` — three `<h1>Dashboard</h1>` → `<PageTitle>Home</PageTitle>` (Task 3).
- `src/app/dashboard/bookings/page.tsx` — swap `<h1>Bookings</h1>` (Task 3).
- `src/app/dashboard/notifications/page.tsx` — swap (Task 3).
- `src/app/dashboard/saved/page.tsx` — swap "Your Saved Vendors" (Task 3).
- `src/app/dashboard/money/page.tsx` — swap "Business Analytics" (Task 3).
- `src/app/dashboard/profile/page.tsx` — swap "Edit Profile" (Task 3).
- `src/app/dashboard/profile/calendar/page.tsx` — swap "Calendar" (Task 3).
- `src/app/dashboard/profile/packages/page.tsx` — swap "Your Packages" (Task 3).

---

## Task 1: Scaffold shadcn Sidebar + palette hookup

**Files:**

- Create: `src/components/ui/sidebar.tsx` (shadcn CLI)
- Modify: `src/app/globals.css` — add `--sidebar-*` block

**Interfaces:**

- Consumes: nothing
- Produces: `SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuBadge`, `SidebarInset`, `SidebarTrigger`, `useSidebar()` — imported from `@/components/ui/sidebar`.

- [ ] **Step 1: Run the shadcn CLI**

```bash
npx shadcn@latest add sidebar
```

When prompted about installing peer deps (e.g. `class-variance-authority`, `@radix-ui/react-slot`), accept — the app already uses them, but CLI verifies.

- [ ] **Step 2: Verify the file landed**

```bash
ls -la src/components/ui/sidebar.tsx
```

Expected: file exists, ~700 lines.

- [ ] **Step 3: Add the `--sidebar-*` token block to `globals.css`**

Open `src/app/globals.css`. Find the `:root {` block that already defines `--cream`, `--indigo`, `--ink`, etc. (around line 15). Add these lines at the end of the `:root` block, before its closing brace:

```css
/* shadcn Sidebar tokens — mapped to Baazar palette (Section 1, spec 2026-07-03). */
--sidebar-background: 40 55% 94%; /* between cream and cream-soft */
--sidebar-foreground: var(--ink);
--sidebar-primary: var(--ink);
--sidebar-primary-foreground: var(--cream);
--sidebar-accent: 232 56% 41%; /* indigo, used at alpha via bg-sidebar-accent/10 */
--sidebar-accent-foreground: var(--ink);
--sidebar-border: var(--hairline);
--sidebar-ring: var(--indigo);
```

- [ ] **Step 4: Extend `tailwind.config.ts` to expose the new tokens as Tailwind colors**

Open `tailwind.config.ts`. In the `theme.extend.colors` block (below the existing `cream`, `ink`, etc.), add:

```ts
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background) / <alpha-value>)',
          foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'hsl(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'hsl(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'hsl(var(--sidebar-border) / <alpha-value>)',
          ring: 'hsl(var(--sidebar-ring) / <alpha-value>)',
        },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/sidebar.tsx src/app/globals.css tailwind.config.ts
git commit -m "chore(sidebar): scaffold shadcn Sidebar primitives + Baazar palette tokens"
```

---

## Task 2: Shared `<PageTitle>` component

**Files:**

- Create: `src/components/dashboard/PageTitle.tsx`
- Create: `src/__tests__/components/dashboard/PageTitle.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `<PageTitle>{children}</PageTitle>` — `<h1>` element with the solid haldi-block treatment. Accepts a `className` prop that's `cn()`-merged into the base classes so callers can add layout margins if needed. Also accepts a `subtitle?: string` prop that renders a muted line beneath (used on Settings and Profile pages).

- [ ] **Step 0: Confirm `@testing-library/react` is installed**

```bash
grep -E '"@testing-library/react"' package.json
```

If no output, install it:

```bash
npm install --save-dev @testing-library/react @testing-library/user-event
```

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/dashboard/PageTitle.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTitle } from '@/components/dashboard/PageTitle';

describe('PageTitle', () => {
  it('renders children as an h1', () => {
    render(<PageTitle>Home</PageTitle>);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Home');
  });

  it('applies the haldi block classes', () => {
    render(<PageTitle>Bookings</PageTitle>);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toMatch(/bg-haldi/);
    expect(h1.className).toMatch(/text-ink/);
  });

  it('renders subtitle when provided', () => {
    render(<PageTitle subtitle="Update your password and email address.">Settings</PageTitle>);
    expect(screen.getByText('Update your password and email address.')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<PageTitle className="mb-8">Home</PageTitle>);
    const wrapper = screen.getByTestId('page-title-wrapper');
    expect(wrapper.className).toMatch(/mb-8/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/dashboard/PageTitle.test.tsx`
Expected: FAIL with "Cannot find module '@/components/dashboard/PageTitle'".

- [ ] **Step 3: Implement `PageTitle`**

Create `src/components/dashboard/PageTitle.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageTitleProps {
  children: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export function PageTitle({ children, subtitle, className }: PageTitleProps) {
  return (
    <div
      className={cn('flex flex-col items-start gap-2', className)}
      data-testid="page-title-wrapper"
    >
      <h1
        className={cn(
          'inline-block rounded-md bg-haldi px-3.5 py-1.5 text-2xl font-medium leading-tight',
          'text-balance font-serif text-ink',
          'shadow-[2px_2px_0_rgba(27,20,20,0.08)]'
        )}
      >
        {children}
      </h1>
      {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/dashboard/PageTitle.test.tsx`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/PageTitle.tsx src/__tests__/components/dashboard/PageTitle.test.tsx
git commit -m "feat(dashboard): shared PageTitle component with haldi block treatment"
```

---

## Task 3: Swap page titles across every top-level dashboard page

**Files (all Modify):**

- `src/app/dashboard/page.tsx` — three occurrences of `<h1 className="text-2xl font-bold">Dashboard</h1>`
- `src/app/dashboard/bookings/page.tsx` — two occurrences of `<h1 className="text-2xl font-bold">Bookings</h1>`
- `src/app/dashboard/notifications/page.tsx` — one occurrence
- `src/app/dashboard/saved/page.tsx` — one occurrence, text `Your Saved Vendors`
- `src/app/dashboard/money/page.tsx` — one occurrence, text `Business Analytics`
- `src/app/dashboard/profile/page.tsx` — one occurrence, text `Edit Profile`
- `src/app/dashboard/profile/calendar/page.tsx` — one occurrence
- `src/app/dashboard/profile/packages/page.tsx` — one occurrence, text `Your Packages`

**Interfaces:**

- Consumes: `<PageTitle>` from Task 2.
- Produces: no new exports; visual consistency across dashboard.

- [ ] **Step 1: Add the import to each page**

For every file listed above, add this import near the other component imports:

```tsx
import { PageTitle } from '@/components/dashboard/PageTitle';
```

- [ ] **Step 2: Replace each `<h1>` in `src/app/dashboard/page.tsx`**

The Home page currently has three branches (couple / vendor no packages / vendor with packages), each with `<h1 className="text-2xl font-bold">Dashboard</h1>`. Replace all three with:

```tsx
<PageTitle>Home</PageTitle>
```

Grep to confirm no `<h1>Dashboard</h1>` remains:

```bash
grep -n "Dashboard</h1>" src/app/dashboard/page.tsx
```

Expected: no output.

- [ ] **Step 3: Replace `<h1>` in each remaining page**

Apply the following per-file swaps. Where the source has extra wrapper classes (e.g. `text-pretty`), keep the parent container div; only the `<h1>` element itself is replaced.

| File                        | Old title                                                                              | New                                                          |
| --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `bookings/page.tsx`         | `<h1 className="text-2xl font-bold">Bookings</h1>` (2×)                                | `<PageTitle>Bookings</PageTitle>`                            |
| `notifications/page.tsx`    | `<h1 className="text-2xl font-bold">Notifications</h1>`                                | `<PageTitle>Notifications</PageTitle>`                       |
| `saved/page.tsx`            | `<h1 className="mb-6 text-pretty text-2xl font-bold text-ink">Your Saved Vendors</h1>` | `<PageTitle className="mb-6">Your Saved Vendors</PageTitle>` |
| `money/page.tsx`            | `<h1 className="text-pretty text-2xl font-bold">Business Analytics</h1>`               | `<PageTitle>Business Analytics</PageTitle>`                  |
| `profile/page.tsx`          | `<h1 className="text-pretty text-2xl font-bold">Edit Profile</h1>`                     | `<PageTitle>Edit Profile</PageTitle>`                        |
| `profile/calendar/page.tsx` | `<h1 className="text-2xl font-bold">Calendar</h1>`                                     | `<PageTitle>Calendar</PageTitle>`                            |
| `profile/packages/page.tsx` | `<h1 className="text-pretty text-2xl font-bold">Your Packages</h1>`                    | `<PageTitle>Your Packages</PageTitle>`                       |

Note: `saved/page.tsx` also has a `<h2>No saved vendors yet</h2>` and `profile/packages/page.tsx` has a `<h2>No packages yet</h2>`. Leave the `<h2>`s untouched — those are sub-headings inside empty-state cards, not page titles.

- [ ] **Step 4: Verify no `<h1 ... 2xl font-bold ...>` remains under `src/app/dashboard/`**

```bash
grep -rEn '<h1[^>]*text-2xl[^>]*font-bold' src/app/dashboard/
```

Expected: no output. Any hit means a page title was missed.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/
git commit -m "feat(dashboard): swap top-level page titles to haldi PageTitle block"
```

---

## Task 4: `sidebar-counts.ts` — role-aware count queries

**Files:**

- Create: `src/lib/dashboard/sidebar-counts.ts`
- Create: `src/__tests__/lib/sidebar-counts.test.ts`

**Interfaces:**

- Consumes: a `SupabaseClient` instance.
- Produces:
  - `getBookingsNeedsActionCount(supabase, role: 'couple' | 'vendor', userId: string, activeBusinessId: string | null): Promise<number>` — returns 0 on any error path or when required inputs are missing.
  - `getUnreadNotificationsCount(supabase, userId: string): Promise<number>` — returns 0 on any error path.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/sidebar-counts.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  getBookingsNeedsActionCount,
  getUnreadNotificationsCount,
} from '@/lib/dashboard/sidebar-counts';

function mockCountResponse(count: number, error: unknown = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => Promise.resolve({ count, error })),
  };
  return { from: vi.fn(() => chain), _chain: chain };
}

describe('getBookingsNeedsActionCount', () => {
  it('returns count for vendor filtering by vendor_profile_id + pending_quote', async () => {
    const { from } = mockCountResponse(3);
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'vendor', 'u1', 'biz1');
    expect(count).toBe(3);
    expect(from).toHaveBeenCalledWith('bookings');
  });

  it('returns 0 for vendor when activeBusinessId is null', async () => {
    const { from } = mockCountResponse(3);
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'vendor', 'u1', null);
    expect(count).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns count for couple filtering by couple_user_id + accepted/adjusted_quote_sent', async () => {
    const { from } = mockCountResponse(2);
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'couple', 'u1', null);
    expect(count).toBe(2);
  });

  it('returns 0 on supabase error', async () => {
    const { from } = mockCountResponse(0, { message: 'boom' });
    const supabase = { from } as any;
    const count = await getBookingsNeedsActionCount(supabase, 'vendor', 'u1', 'biz1');
    expect(count).toBe(0);
  });
});

describe('getUnreadNotificationsCount', () => {
  it('returns count for the current user where read_at is null', async () => {
    const { from } = mockCountResponse(5);
    const supabase = { from } as any;
    const count = await getUnreadNotificationsCount(supabase, 'u1');
    expect(count).toBe(5);
    expect(from).toHaveBeenCalledWith('notifications');
  });

  it('returns 0 on error', async () => {
    const { from } = mockCountResponse(0, { message: 'boom' });
    const supabase = { from } as any;
    const count = await getUnreadNotificationsCount(supabase, 'u1');
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/sidebar-counts.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dashboard/sidebar-counts'".

- [ ] **Step 3: Implement `sidebar-counts.ts`**

Create `src/lib/dashboard/sidebar-counts.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

type Role = 'couple' | 'vendor';

export async function getBookingsNeedsActionCount(
  supabase: SupabaseClient,
  role: Role,
  userId: string,
  activeBusinessId: string | null
): Promise<number> {
  if (role === 'vendor') {
    if (!activeBusinessId) return 0;
    const { count, error } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', activeBusinessId)
      .eq('status', 'pending_quote');
    if (error) return 0;
    return count ?? 0;
  }

  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('couple_user_id', userId)
    .in('status', ['accepted', 'adjusted_quote_sent']);
  if (error) return 0;
  return count ?? 0;
}

export async function getUnreadNotificationsCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}
```

- [ ] **Step 4: Update the test to match the real chain shape (`select` returns something `eq/in/is` chainable)**

The mock in Step 1 needs a small tweak: `.select()` on a `head: true` query in Supabase returns a promise-like with `{ count, error }`, but chains continue via `eq`/`in`/`is`. Update the mock chain so `select` returns `chain` and the final `.eq()`/`.in()`/`.is()` returns the resolved promise. Adjust the mock in `sidebar-counts.test.ts` so the trailing chain resolves after the correct number of `.eq`/`.in` calls:

Replace the `mockCountResponse` helper with:

```ts
function mockCountResponse(count: number, error: unknown = null) {
  const resolved = Promise.resolve({ count, error });
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.then = resolved.then.bind(resolved);
  return { from: vi.fn(() => chain), _chain: chain };
}
```

This makes the chain thenable so `await ...eq(...).eq(...)` resolves.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/lib/sidebar-counts.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard/sidebar-counts.ts src/__tests__/lib/sidebar-counts.test.ts
git commit -m "feat(sidebar): role-aware needs-action + unread notifications counts"
```

---

## Task 5: `VendorBusinessAnchor` server component

**Files:**

- Create: `src/components/dashboard/sidebar/VendorBusinessAnchor.tsx`

**Interfaces:**

- Consumes: nothing at import time. Takes the shape returned by `getActiveVendorProfile(supabase, userId)` in `src/lib/vendor/active.ts`. At runtime, called from `layout.tsx` (Task 8) with a pre-fetched business row.
- Produces: `<VendorBusinessAnchor business={businessRow} />` — renders business name (Spectral in ink) + verified indigo pill (if `business.verified`) + city (from `business.city`, or nothing if null). Returns `null` if `business` is null.

- [ ] **Step 1: Implement `VendorBusinessAnchor`**

Create `src/components/dashboard/sidebar/VendorBusinessAnchor.tsx`:

```tsx
import * as React from 'react';
import { Check } from 'lucide-react';

interface BusinessData {
  business_name: string | null;
  verified: boolean | null;
  city: string | null;
}

interface Props {
  business: BusinessData | null;
}

export function VendorBusinessAnchor({ business }: Props) {
  if (!business || !business.business_name) return null;

  return (
    <div className="flex flex-col gap-2 px-2 py-3">
      <span className="text-balance font-serif text-[19px] font-medium leading-tight tracking-tight text-ink">
        {business.business_name}
      </span>
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {business.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo/20 bg-indigo/[.10] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-indigo">
            <Check className="size-3" aria-hidden="true" strokeWidth={2.4} />
            Verified
          </span>
        ) : null}
        {business.city ? <span>{business.city}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/sidebar/VendorBusinessAnchor.tsx
git commit -m "feat(sidebar): VendorBusinessAnchor server component for header"
```

---

## Task 6: `SidebarUserMenu` client component

**Files:**

- Create: `src/components/dashboard/sidebar/SidebarUserMenu.tsx`

**Interfaces:**

- Consumes: `SidebarMenuButton` from `@/components/ui/sidebar`; `DropdownMenu*` from `@/components/ui/dropdown-menu`; `createBrowserSupabaseClient` from `@/lib/supabase/client` (existing helper — if not present under this exact name, use whatever `import { createClient } from '@/lib/supabase/client'` pattern the app already uses; verify with `grep -rn 'createBrowserSupabaseClient\|@/lib/supabase/client' src/components | head -3`).
- Produces: `<SidebarUserMenu user={{ email, initial }} />` — renders inside `SidebarFooter`. Avatar (indigo bg, cream initial) + name + email + chevron. Dropdown items: **Profile** (`Link` to `/dashboard/profile`) and **Log out** (calls `supabase.auth.signOut()` then `router.push('/login')`).

- [ ] **Step 1: Confirm the browser Supabase client import path**

```bash
grep -rEn "from '@/lib/supabase/client'" src/components | head -3
```

Note the exact export name (e.g., `createBrowserSupabaseClient` or `createClient`) — use it in Step 2 unchanged.

- [ ] **Step 2: Implement `SidebarUserMenu`**

Create `src/components/dashboard/sidebar/SidebarUserMenu.tsx`. Adjust the Supabase client import line based on Step 1's finding:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronUp, LogOut, User as UserIcon } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  user: { email: string; initial: string };
}

export function SidebarUserMenu({ user }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handleLogout() {
    setBusy(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent/10"
              aria-label="Open account menu"
            >
              <span className="grid size-8 place-items-center rounded-full bg-indigo font-serif text-sm font-medium text-cream">
                {user.initial}
              </span>
              <span className="flex flex-col overflow-hidden text-left leading-tight">
                <span className="truncate text-sm font-semibold text-ink">{user.email}</span>
              </span>
              <ChevronUp className="ml-auto size-4 text-ink-soft" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="flex items-center gap-2">
                <UserIcon className="size-4" aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={busy}
              className="text-hot-pink focus:text-hot-pink"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If the Supabase client import errors, correct it per Step 1's finding.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/sidebar/SidebarUserMenu.tsx
git commit -m "feat(sidebar): SidebarUserMenu with Profile + Log out dropdown"
```

---

## Task 7: `SidebarNav` rewrite

**Files:**

- Modify (full rewrite): `src/components/dashboard/SidebarNav.tsx`

**Interfaces:**

- Consumes: shadcn Sidebar primitives from Task 1; `VendorBusinessAnchor` (Task 5); `SidebarUserMenu` (Task 6).
- Produces: `<SidebarNav role businessAnchor userMenu bookingsCount hasUnreadNotifications />` — client component.
  - `role: 'couple' | 'vendor'` — drives link list.
  - `businessAnchor: React.ReactNode` — pre-rendered VendorBusinessAnchor (or null). Vendor-only in practice.
  - `userMenu: React.ReactNode` — pre-rendered SidebarUserMenu.
  - `bookingsCount: number` — shows haldi pill when > 0.
  - `hasUnreadNotifications: boolean` — shows hot-pink dot when true.

- [ ] **Step 1: Replace `SidebarNav.tsx` end-to-end**

Overwrite `src/components/dashboard/SidebarNav.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  Heart,
  Home,
  Package,
  Settings as SettingsIcon,
  User,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type Role = 'couple' | 'vendor';

interface Props {
  role: Role;
  businessAnchor: React.ReactNode;
  userMenu: React.ReactNode;
  bookingsCount: number;
  hasUnreadNotifications: boolean;
}

interface LinkDef {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  showBookingsCounter?: boolean;
  showUnreadDot?: boolean;
}

function workspaceLinks(role: Role): LinkDef[] {
  const links: LinkDef[] = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/bookings', label: 'Bookings', icon: BookOpen, showBookingsCounter: true },
  ];
  if (role === 'couple') {
    links.push({ href: '/dashboard/saved', label: 'Saved', icon: Heart });
  }
  links.push({
    href: '/dashboard/notifications',
    label: 'Notifications',
    icon: Bell,
    showUnreadDot: true,
  });
  if (role === 'vendor') {
    links.push(
      { href: '/dashboard/profile/calendar', label: 'Calendar', icon: Calendar },
      { href: '/dashboard/profile/packages', label: 'Packages', icon: Package },
      { href: '/dashboard/money', label: 'Business Analytics', icon: BarChart3 },
      { href: '/dashboard/profile', label: 'Profile', icon: User }
    );
  }
  return links;
}

export function SidebarNav({
  role,
  businessAnchor,
  userMenu,
  bookingsCount,
  hasUnreadNotifications,
}: Props) {
  const pathname = usePathname();

  // Preserves prior isActive semantics.
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === '/dashboard') return false;
    if (href === '/dashboard/profile') {
      return pathname.startsWith('/dashboard/profile/setup');
    }
    return pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon">
      {role === 'vendor' && businessAnchor ? (
        <SidebarHeader className="border-b border-hairline-soft">{businessAnchor}</SidebarHeader>
      ) : null}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Workspace
          </SidebarGroupLabel>
          <SidebarMenu>
            {workspaceLinks(role).map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                    <Link href={link.href}>
                      <Icon className="size-4" aria-hidden />
                      <span>{link.label}</span>
                      {link.showUnreadDot && hasUnreadNotifications ? (
                        <span
                          aria-label="Unread notifications"
                          className="ml-auto size-2 rounded-full bg-hot-pink shadow-[0_0_0_3px_rgba(209,0,108,0.18)]"
                        />
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                  {link.showBookingsCounter && bookingsCount > 0 ? (
                    <SidebarMenuBadge
                      className={cn(
                        'border border-haldi/45 bg-haldi/25 text-ink',
                        'font-mono text-[11px] font-bold tabular-nums'
                      )}
                    >
                      {bookingsCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-3 border-t border-indigo/[.14] pt-3">
          <SidebarGroupLabel className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
            Account
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive('/dashboard/settings')}
                tooltip="Settings"
              >
                <Link href="/dashboard/settings">
                  <SettingsIcon className="size-4" aria-hidden />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{userMenu}</SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/SidebarNav.tsx
git commit -m "feat(sidebar): rewrite SidebarNav on shadcn primitives with role-driven link list"
```

---

## Task 8: Wire `SidebarProvider` + counts into `layout.tsx`

**Files:**

- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**

- Consumes: `SidebarNav` (Task 7); `VendorBusinessAnchor` (Task 5); `SidebarUserMenu` (Task 6); `getBookingsNeedsActionCount` + `getUnreadNotificationsCount` (Task 4); `SidebarProvider` + `SidebarInset` + `SidebarTrigger` from `@/components/ui/sidebar`; existing `getActiveVendorProfileId` from `@/lib/vendor/active`.
- Produces: dashboard shell with sidebar on desktop + drawer on mobile, both handled by shadcn's built-in behavior. Preserves the `panel` parallel-route slot.

- [ ] **Step 1: Confirm the active-business fetch helper**

The current layout only fetches the ID via `getActiveVendorProfileId`. We now need the full row (business_name + verified + city) for the anchor. Check whether a full-row helper exists:

```bash
grep -nE "export (async )?function getActiveVendorProfile" src/lib/vendor/active.ts
```

If a `getActiveVendorProfile(supabase, userId)` function exists that returns the full row, use it. If not, extend the file (see optional Step 1a) — do NOT inline the query.

- [ ] **Step 1a (only if the helper is missing): Add it to `src/lib/vendor/active.ts`**

Add this export at the bottom of `src/lib/vendor/active.ts`:

```ts
export async function getActiveVendorProfileFullRow(
  supabase: SupabaseClient,
  userId: string
): Promise<Pick<VendorProfileRow, 'id' | 'business_name' | 'verified' | 'city'> | null> {
  const activeId = await getActiveVendorProfileId(supabase, userId);
  if (!activeId) return null;
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, verified, city')
    .eq('id', activeId)
    .single();
  if (error) return null;
  return data;
}
```

(Adjust the import of `SupabaseClient` at the top of the file if needed — check the existing pattern.)

- [ ] **Step 2: Replace `src/app/dashboard/layout.tsx` end-to-end**

Overwrite `src/app/dashboard/layout.tsx`:

```tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BaazarChrome } from '@/components/ui/BaazarChrome';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';

import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { VendorBusinessAnchor } from '@/components/dashboard/sidebar/VendorBusinessAnchor';
import { SidebarUserMenu } from '@/components/dashboard/sidebar/SidebarUserMenu';
import { getActiveVendorProfileId, getActiveVendorProfileFullRow } from '@/lib/vendor/active';
import { ActiveBusinessProvider } from '@/contexts/ActiveBusinessContext';
import {
  getBookingsNeedsActionCount,
  getUnreadNotificationsCount,
} from '@/lib/dashboard/sidebar-counts';

export default async function DashboardLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  const activeBusinessId =
    role === 'vendor' ? await getActiveVendorProfileId(supabase, user.id) : null;

  const activeBusiness =
    role === 'vendor' ? await getActiveVendorProfileFullRow(supabase, user.id) : null;

  const [bookingsCount, unreadCount] = await Promise.all([
    getBookingsNeedsActionCount(supabase, role, user.id, activeBusinessId),
    getUnreadNotificationsCount(supabase, user.id),
  ]);

  const email = user.email ?? '';
  const initial = (email.charAt(0) || '?').toUpperCase();

  return (
    <ActiveBusinessProvider activeBusinessId={activeBusinessId}>
      <div className="min-h-screen bg-muted/40">
        <BaazarChrome />
        <SidebarProvider>
          <SidebarNav
            role={role}
            businessAnchor={<VendorBusinessAnchor business={activeBusiness} />}
            userMenu={<SidebarUserMenu user={{ email, initial }} />}
            bookingsCount={bookingsCount}
            hasUnreadNotifications={unreadCount > 0}
          />
          <SidebarInset>
            <div className="mx-auto flex w-full max-w-7xl gap-4 px-4 pb-8 pt-24 sm:px-6 lg:px-8">
              <SidebarTrigger className="absolute right-4 top-20 z-10 md:hidden" />
              <main className="flex-1">{children}</main>
            </div>
          </SidebarInset>
        </SidebarProvider>
        {panel}
      </div>
    </ActiveBusinessProvider>
  );
}
```

Notes:

- `SidebarProvider` handles the desktop rail + mobile drawer state internally.
- `SidebarTrigger` replaces the manual `Sheet`/`SheetTrigger` wiring.
- `panel` slot preserved untouched.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Boot dev server and eyeball**

```bash
PORT=3001 npm run dev
```

In a separate terminal, `curl -s http://localhost:3001/ | head -c 100` returns HTML (not a crash). Open `http://localhost:3001/dashboard` in a browser as a logged-in vendor — sidebar renders with business anchor, links, footer user card.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/layout.tsx src/lib/vendor/active.ts
git commit -m "feat(dashboard): wire SidebarProvider + counts + business anchor into layout"
```

---

## Task 9: Password change — API route + form

**Files:**

- Create: `src/app/api/settings/password/route.ts`
- Create: `src/components/settings/PasswordChangeForm.tsx`
- Create: `src/__tests__/api/settings-password.test.ts`

**Interfaces:**

- Consumes: `createServerSupabaseClient` from `@/lib/supabase/server` (existing helper).
- Produces:
  - API: `POST /api/settings/password` — body `{ current_password: string, new_password: string }`. Response `{ ok: true }` on success; `{ error: string }` with 4xx on failure.
  - `<PasswordChangeForm />` — client component; three password inputs; on submit POSTs the two passwords; shows toast + resets form on success.

- [ ] **Step 1: Write the failing API test**

Create `src/__tests__/api/settings-password.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { POST } from '@/app/api/settings/password/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const mockedCreate = vi.mocked(createServerSupabaseClient);

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/settings/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/settings/password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400s on missing fields', async () => {
    mockedCreate.mockResolvedValue({} as any);
    const res = await POST(buildRequest({ current_password: 'x' }));
    expect(res.status).toBe(400);
  });

  it('401s when user is not signed in', async () => {
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);
    const res = await POST(buildRequest({ current_password: 'a', new_password: 'b12345678' }));
    expect(res.status).toBe(401);
  });

  it('400s when current password is wrong', async () => {
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co' } } }),
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ error: { message: 'Invalid login credentials' } }),
        updateUser: vi.fn(),
      },
    } as any);
    const res = await POST(buildRequest({ current_password: 'wrong', new_password: 'b12345678' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/current password/i);
  });

  it('200s and updates on happy path', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.co' } } }),
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        updateUser,
      },
    } as any);
    const res = await POST(buildRequest({ current_password: 'ok', new_password: 'new123456' }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: 'new123456' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/settings-password.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/settings/password/route'".

- [ ] **Step 3: Implement the API route**

Create `src/app/api/settings/password/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    current_password?: string;
    new_password?: string;
  } | null;

  const current = body?.current_password;
  const next = body?.new_password;

  if (!current || !next || next.length < 8) {
    return NextResponse.json(
      { error: 'Missing fields or new password too short.' },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (reauth.error) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/api/settings-password.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Implement the client form**

Create `src/components/settings/PasswordChangeForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordChangeForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    if (next.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update password.');
        return;
      }
      toast.success('Password updated.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current_password">Current password</Label>
        <Input
          id="current_password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new_password">New password</Label>
          <Input
            id="new_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirm new password</Label>
          <Input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/settings/password/route.ts src/components/settings/PasswordChangeForm.tsx src/__tests__/api/settings-password.test.ts
git commit -m "feat(settings): password change API + form (Supabase re-auth then updateUser)"
```

---

## Task 10: Email change — API route + form

**Files:**

- Create: `src/app/api/settings/email/route.ts`
- Create: `src/components/settings/EmailChangeForm.tsx`
- Create: `src/__tests__/api/settings-email.test.ts`

**Interfaces:**

- Consumes: `createServerSupabaseClient` from `@/lib/supabase/server`.
- Produces:
  - API: `POST /api/settings/email` — body `{ new_email: string }`. Response `{ ok: true }` on success; `{ error: string }` on failure.
  - `<EmailChangeForm />` — client component; one email input + submit + on-success callout state.

- [ ] **Step 1: Write the failing API test**

Create `src/__tests__/api/settings-email.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { POST } from '@/app/api/settings/email/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const mockedCreate = vi.mocked(createServerSupabaseClient);

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/settings/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/settings/email', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400s on missing or invalid email', async () => {
    mockedCreate.mockResolvedValue({} as any);
    const res = await POST(buildRequest({ new_email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('401s when not signed in', async () => {
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);
    const res = await POST(buildRequest({ new_email: 'a@b.co' }));
    expect(res.status).toBe(401);
  });

  it('200s and calls updateUser on happy path', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mockedCreate.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        updateUser,
      },
    } as any);
    const res = await POST(buildRequest({ new_email: 'new@example.com' }));
    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/settings-email.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/settings/email/route'".

- [ ] **Step 3: Implement the API route**

Create `src/app/api/settings/email/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { new_email?: string } | null;
  const next = body?.new_email?.trim();

  if (!next || !EMAIL_RE.test(next)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ email: next });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/api/settings-email.test.ts`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Implement the client form**

Create `src/components/settings/EmailChangeForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  currentEmail: string;
}

export function EmailChangeForm({ currentEmail }: Props) {
  const [email, setEmail] = useState(currentEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ new_email: email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update email.');
        return;
      }
      toast.success('Confirmation emails sent.');
      setSent(true);
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new_email">New email address</Label>
        <Input
          id="new_email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={sent || busy}
        />
      </div>
      <div className="rounded-md border border-indigo/[.18] bg-indigo/[.06] p-3 text-sm text-ink-muted">
        <strong className="font-semibold text-indigo">Heads up —</strong> we'll send confirmation
        links to both your old and new email. The change takes effect once both are clicked.
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || sent}>
          {sent ? 'Check your inbox' : busy ? 'Sending…' : 'Update email'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/settings/email/route.ts src/components/settings/EmailChangeForm.tsx src/__tests__/api/settings-email.test.ts
git commit -m "feat(settings): email change API + form (Supabase confirm-both-emails flow)"
```

---

## Task 11: Settings page assembly

**Files:**

- Create: `src/app/dashboard/settings/page.tsx`

**Interfaces:**

- Consumes: `PageTitle` (Task 2); `PasswordChangeForm` (Task 9); `EmailChangeForm` (Task 10); `createServerSupabaseClient`.
- Produces: `/dashboard/settings` — server component; renders `PageTitle` "Settings" + two Card-wrapped forms stacked. Fetches the current email from Supabase and passes it to `EmailChangeForm`.

- [ ] **Step 1: Implement the page**

Create `src/app/dashboard/settings/page.tsx`:

```tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { PasswordChangeForm } from '@/components/settings/PasswordChangeForm';
import { EmailChangeForm } from '@/components/settings/EmailChangeForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Update your password and email address.">Settings</PageTitle>

      <Card className="border-l-[3px] border-l-indigo/70">
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>

      <Card className="border-l-[3px] border-l-indigo/70">
        <CardHeader>
          <CardTitle>Email address</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailChangeForm currentEmail={user.email ?? ''} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Boot dev + eyeball**

With the dev server from Task 8 still running, open `http://localhost:3001/dashboard/settings`. Verify:

- Haldi "Settings" title block renders.
- Two cards visible — Password + Email — with the indigo left rail.
- Sidebar shows Settings link as active in the Account group.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/page.tsx
git commit -m "feat(settings): assemble /dashboard/settings page with password + email cards"
```

---

## Task 12: Playwright specs

**Files:**

- Create: `tests/e2e/sidebar-vendor.spec.ts`
- Create: `tests/e2e/sidebar-couple.spec.ts`
- Create: `tests/e2e/settings-password.spec.ts`

**Interfaces:**

- Consumes: existing `tests/e2e` login helpers. Check `tests/e2e/auth.spec.ts` for the pattern before writing:

```bash
head -40 tests/e2e/auth.spec.ts
```

If a shared helper like `loginAsVendor(page)` / `loginAsCouple(page)` already exists in a fixture file, use it. Otherwise inline the login steps in each spec (matching the pattern in `auth.spec.ts`).

- Produces: three specs that will run in CI's Playwright job.

- [ ] **Step 1: Vendor sidebar spec**

Create `tests/e2e/sidebar-vendor.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('vendor sidebar', () => {
  test('renders vendor-only links + Settings, routes to Settings', async ({ page }) => {
    // TODO: replace inline login with shared helper if one exists.
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.E2E_VENDOR_EMAIL ?? 'vendor@e2e.test');
    await page.fill('input[name="password"]', process.env.E2E_VENDOR_PASSWORD ?? 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    const sidebar = page.getByRole('complementary').or(page.getByRole('navigation')).first();
    await expect(sidebar.getByRole('link', { name: /^Home$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Bookings$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Notifications$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Calendar$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Packages$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Business Analytics$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Profile$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Settings$/ })).toBeVisible();

    await sidebar.getByRole('link', { name: /^Settings$/ }).click();
    await page.waitForURL('**/dashboard/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Couple sidebar spec**

Create `tests/e2e/sidebar-couple.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('couple sidebar', () => {
  test('renders couple-only links + Settings, hides vendor links', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.E2E_COUPLE_EMAIL ?? 'couple@e2e.test');
    await page.fill('input[name="password"]', process.env.E2E_COUPLE_PASSWORD ?? 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    const sidebar = page.getByRole('complementary').or(page.getByRole('navigation')).first();
    await expect(sidebar.getByRole('link', { name: /^Home$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Bookings$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Saved$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Notifications$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Settings$/ })).toBeVisible();

    await expect(sidebar.getByRole('link', { name: /^Calendar$/ })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: /^Packages$/ })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: /^Business Analytics$/ })).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Settings password spec**

Create `tests/e2e/settings-password.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('settings — password change', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.E2E_VENDOR_EMAIL ?? 'vendor@e2e.test');
    await page.fill('input[name="password"]', process.env.E2E_VENDOR_PASSWORD ?? 'test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    await page.goto('/dashboard/settings');
  });

  test('wrong current password → error toast', async ({ page }) => {
    await page.getByLabel('Current password').fill('definitely-wrong');
    await page.getByLabel('New password').fill('newpass1234');
    await page.getByLabel('Confirm new password').fill('newpass1234');
    await page.getByRole('button', { name: /Update password/ }).click();
    await expect(page.getByText(/Current password is incorrect/i)).toBeVisible();
  });

  test('mismatched confirm → error toast without hitting API', async ({ page }) => {
    await page.getByLabel('Current password').fill('anything');
    await page.getByLabel('New password').fill('newpass1234');
    await page.getByLabel('Confirm new password').fill('newpass9999');
    await page.getByRole('button', { name: /Update password/ }).click();
    await expect(page.getByText(/don't match/i)).toBeVisible();
  });
});
```

Note: skipping the happy-path test (would rotate the E2E user's password mid-suite and break every subsequent run). Wrong-password + mismatch cover the two negative branches without side effects.

- [ ] **Step 4: Boot dev server + run the specs against it**

In one terminal:

```bash
PORT=3001 npm run dev
```

In another:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 PLAYWRIGHT_SKIP_WEB_SERVER=1 \
  npx playwright test tests/e2e/sidebar-vendor.spec.ts tests/e2e/sidebar-couple.spec.ts tests/e2e/settings-password.spec.ts --reporter=list
```

Expected: 4 tests passing (1 vendor + 1 couple + 2 password).

If the login helper differs from the inline pattern shown, adjust the specs to match the shared fixture pattern found in `tests/e2e/auth.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/sidebar-vendor.spec.ts tests/e2e/sidebar-couple.spec.ts tests/e2e/settings-password.spec.ts
git commit -m "test(e2e): sidebar vendor/couple link lists + settings password flow"
```

---

## Post-plan: PR

Not part of the plan-executor's flow, but for reference — after Task 12 lands:

- Push branch: `git push -u origin feat/sidebar-shadcn-plus-settings`.
- Open PR via `gh pr create` with the title `feat(dashboard): shadcn Sidebar redesign + Settings (password + email)`. Body should link back to `docs/superpowers/specs/2026-07-03-sidebar-and-settings-design.md` and include before/after screenshots at vendor default + vendor collapsed + couple + settings states.
- Standard merge-rule override applies (per [memory](../memory/e2e_suite_broken_2026_06_30.md)): typecheck/lint/unit/build must be green; pre-existing broken e2e job is override-able if failures are unrelated.
