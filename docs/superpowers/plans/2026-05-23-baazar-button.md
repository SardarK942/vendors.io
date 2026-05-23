# Baazar Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Baazar M+ button component per [`2026-05-23-baazar-button-design.md`](../specs/2026-05-23-baazar-button-design.md) — 5 variants × 3 sizes × 5 states + icon slots + tooltip primitive, with backwards-compatible aliases so existing 44 shadcn variant call-sites keep working without code changes.

**Architecture:** Rewrite `src/components/ui/button.tsx` in place using `cva` + `@radix-ui/react-slot` (both already installed). Add `src/components/ui/tooltip.tsx` as a thin Radix wrapper styled to M+. Internal alias normalizer maps old variant/size names → new names with dev-only console warnings. No new test infra (codebase has zero React component tests today; adding `@testing-library/react` + jsdom is out of scope for this PR). Validation = TypeScript compile + lint + Playwright visual screenshots of three live surfaces (homepage, signup, vendor CRM).

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind 3.4, `class-variance-authority` ^0.7.1, `@radix-ui/react-slot` ^1.2.4, `@radix-ui/react-tooltip` (to be installed), `lucide-react` ^0.564.0.

---

## File Structure

| File                                                        | Action                          | Responsibility                                                                                                  |
| ----------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/button.tsx`                              | **Rewrite in place**            | New cva config with 5 variants × 3 sizes, alias normalizer, loading spinner, icon slots, `asChild` polymorphism |
| `src/components/ui/tooltip.tsx`                             | **Create new**                  | Radix Tooltip wrapper styled to M+ — ink panel, cream text, 4px corners, 400ms open delay                       |
| `package.json` + `package-lock.json`                        | **Auto-modified**               | Adds `@radix-ui/react-tooltip` dependency                                                                       |
| `DESIGN.md`                                                 | **Modify frontmatter**          | Add `button` + `tooltip` entries to `components` block                                                          |
| `docs/superpowers/specs/2026-05-23-baazar-button-design.md` | **Reference only — no changes** | Already complete                                                                                                |

No tests added. No tailwind config / globals.css changes (M+ tokens already wired in step 2 of the brand rollout).

---

## Task 1: Rewrite `src/components/ui/button.tsx`

**Files:**

- Modify: `src/components/ui/button.tsx` (full rewrite — currently 50 lines, becomes ~145 lines)

- [ ] **Step 1: Read the current file to confirm starting state**

Run: `cat src/components/ui/button.tsx`
Expected: shadcn baseline button with `variant: default|destructive|outline|secondary|ghost|link` and `size: default|sm|lg|icon`. ~50 lines.

- [ ] **Step 2: Replace the file with the new implementation**

Write the following content to `src/components/ui/button.tsx`:

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    'font-sans font-medium rounded-md',
    'transition-all duration-[220ms] ease-[cubic-bezier(.22,1,.36,1)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
    'disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed',
    'motion-reduce:transition-none motion-reduce:hover:transform-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-ink text-cream hover:bg-[#2A1E1E] hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(27,20,20,0.25),0_3px_6px_rgba(27,20,20,0.12)]',
        secondary:
          'bg-transparent text-ink border border-ink hover:bg-cream-soft hover:-translate-y-[3px] hover:shadow-[0_6px_14px_rgba(27,20,20,0.10),0_2px_4px_rgba(27,20,20,0.05)]',
        tertiary: 'bg-transparent text-ink hover:bg-cream-soft',
        link: 'bg-transparent text-ink !h-auto !p-0 hover:underline hover:underline-offset-4 hover:decoration-1',
        destructive:
          'bg-error text-cream hover:bg-[#94121F] hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(184,22,40,0.30),0_3px_6px_rgba(184,22,40,0.15)] focus-visible:ring-error',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs gap-1',
        md: 'h-10 px-5 text-[13px] gap-1.5',
        lg: 'h-12 px-6 text-sm gap-2',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonVariantNative = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSizeNative = NonNullable<VariantProps<typeof buttonVariants>['size']>;
type ButtonVariantAlias = 'default' | 'outline' | 'ghost';
type ButtonSizeAlias = 'default' | 'icon';

const VARIANT_ALIASES: Record<ButtonVariantAlias, ButtonVariantNative> = {
  default: 'primary',
  outline: 'secondary',
  ghost: 'tertiary',
};

const SIZE_ALIASES: Record<ButtonSizeAlias, ButtonSizeNative> = {
  default: 'md',
  icon: 'md',
};

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  variant?: ButtonVariantNative | ButtonVariantAlias;
  size?: ButtonSizeNative | ButtonSizeAlias;
  asChild?: boolean;
  isLoading?: boolean;
  showTextWhileLoading?: boolean;
  iconLeading?: React.ComponentType<{ className?: string }> | React.ReactNode;
  iconTrailing?: React.ComponentType<{ className?: string }> | React.ReactNode;
  children?: React.ReactNode;
}

function isIconComponent(
  icon: React.ComponentType<{ className?: string }> | React.ReactNode | undefined
): icon is React.ComponentType<{ className?: string }> {
  return typeof icon === 'function';
}

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn('animate-spin', className)}
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    <path
      d="M12.5 7a5.5 5.5 0 0 0-5.5-5.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      asChild = false,
      isLoading = false,
      showTextWhileLoading = false,
      iconLeading,
      iconTrailing,
      className,
      children,
      disabled,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const resolvedVariant =
      (VARIANT_ALIASES as Record<string, ButtonVariantNative>)[variant as string] ??
      (variant as ButtonVariantNative);
    const resolvedSize =
      (SIZE_ALIASES as Record<string, ButtonSizeNative>)[size as string] ??
      (size as ButtonSizeNative);

    if (process.env.NODE_ENV !== 'production') {
      if (variant !== resolvedVariant) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Button] variant="${variant}" is deprecated. Use variant="${resolvedVariant}" instead.`
        );
      }
      if (size !== resolvedSize) {
        // eslint-disable-next-line no-console
        console.warn(`[Button] size="${size}" is deprecated. Use size="${resolvedSize}" instead.`);
      }
    }

    const hasChildren = children !== undefined && children !== null && children !== false;
    const hasIcon = iconLeading !== undefined || iconTrailing !== undefined || size === 'icon';
    const isIconOnly = !hasChildren && hasIcon;

    if (process.env.NODE_ENV !== 'production' && isIconOnly && !ariaLabel) {
      // eslint-disable-next-line no-console
      console.error('[Button] Icon-only buttons require an aria-label for accessibility.');
    }

    const iconOnlyClasses = isIconOnly
      ? { sm: 'w-8 !px-0', md: 'w-10 !px-0', lg: 'w-12 !px-0' }[resolvedSize]
      : '';

    const Comp = asChild ? Slot : 'button';

    const renderIcon = (
      icon: React.ComponentType<{ className?: string }> | React.ReactNode | undefined
    ) => {
      if (icon === undefined) return null;
      if (isIconComponent(icon)) {
        const IconComp = icon;
        return <IconComp className="size-4 shrink-0" />;
      }
      return icon;
    };

    const content = isLoading ? (
      <>
        <Spinner className="size-3.5" />
        {showTextWhileLoading && children}
      </>
    ) : (
      <>
        {renderIcon(iconLeading)}
        {children}
        {renderIcon(iconTrailing)}
      </>
    );

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant: resolvedVariant, size: resolvedSize }),
          iconOnlyClasses,
          className
        )}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        aria-disabled={disabled || isLoading || undefined}
        aria-label={ariaLabel}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

- [ ] **Step 3: Run TypeScript compile to catch type errors**

Run: `npm run typecheck`
Expected: exits 0, no output. (Any errors mean the new types don't satisfy existing call sites.)

- [ ] **Step 4: Run lint to catch style issues**

Run: `npm run lint`
Expected: exits 0. If there's a `react/display-name` lint warning, it's already addressed via `Button.displayName = 'Button';`.

- [ ] **Step 5: Quick sanity check — boot dev server hits /**

The dev server should already be running on port 3000 from earlier in the session. If not, run `npm run dev` in the background. Then:

Run: `curl -sI http://localhost:3000/`
Expected: `HTTP/1.1 200 OK`. (If it fails, check `/tmp/baazar-dev.log` for compile errors.)

---

## Task 2: Add Tooltip primitive

**Files:**

- Create: `src/components/ui/tooltip.tsx` (new file)
- Modify: `package.json` + `package-lock.json` (auto via npm install)

- [ ] **Step 1: Install Radix Tooltip**

Run: `npm install @radix-ui/react-tooltip`
Expected: `added 1 package` (or similar). The package is small (~12KB gzipped) and adds no transitive deps you don't already have via other Radix packages.

- [ ] **Step 2: Create the tooltip component**

Write the following content to `src/components/ui/tooltip.tsx`:

```tsx
'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // M+ surface — ink panel, cream text
        'z-50 overflow-hidden rounded-sm bg-ink px-2.5 py-1.5',
        'font-sans text-[12px] font-medium leading-[1.4] text-cream',
        // Animation — 150ms fade-in, ease-out
        'animate-in fade-in-0 zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-1',
        'data-[side=left]:slide-in-from-right-1',
        'data-[side=right]:slide-in-from-left-1',
        'data-[side=top]:slide-in-from-bottom-1',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

/**
 * Convenience wrapper — most consumers just need <Tooltip content="Save">{trigger}</Tooltip>.
 * Uses 400ms open delay (faster than Radix default 700ms — feels less sluggish).
 * For multiple tooltips on a page, wrap them in a single <TooltipProvider> at the layout level.
 */
const Tooltip = ({ content, children, side = 'top', delayDuration = 400 }: TooltipProps) => (
  <TooltipProvider delayDuration={delayDuration} skipDelayDuration={100}>
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };
```

- [ ] **Step 3: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

---

## Task 3: Manual + Playwright visual verification

The reusable Playwright screenshot script from earlier in the session lives at `/Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs`. We'll use it to capture three surfaces and eyeball each.

**Files (read-only — verification, no edits):**

- Read screenshots: `/tmp/baazar-button-home.png`, `/tmp/baazar-button-signup.png`, `/tmp/baazar-button-dashboard.png`

- [ ] **Step 1: Verify the dev server is healthy**

Run: `curl -sI http://localhost:3000/ | head -1`
Expected: `HTTP/1.1 200 OK`. If not, `tail -30 /tmp/baazar-dev.log` to diagnose and restart with `npm run dev` in background.

- [ ] **Step 2: Screenshot the homepage — verify primary CTA looks right**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/ /tmp/baazar-button-home.png`
Expected: JSON output with bodyFont/h1Font + `Saved: /tmp/baazar-button-home.png`.

- [ ] **Step 3: Read the homepage screenshot and verify**

Read: `/tmp/baazar-button-home.png`
Verify:

- "Browse vendors" button is ink-fill with cream text, 6px corners
- Spacing looks right (40px tall, 20px horizontal padding)
- "List your business" button is outline (alias `variant="outline"` resolves to `secondary` — ink border on cream)
- Hot-pink "Quiet chaos" italic still rendering from Step B brand work
- Haldi highlighter still rendering on "South Asian"

- [ ] **Step 4: Screenshot the signup page — verify outline alias works**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/signup /tmp/baazar-button-signup.png`
Expected: Saved.

- [ ] **Step 5: Read the signup screenshot and verify**

Read: `/tmp/baazar-button-signup.png`
Verify: any outlined CTA button on the page renders correctly with ink border + ink text (the alias path).

- [ ] **Step 6: Screenshot the vendor CRM — verify ghost alias works**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/dashboard /tmp/baazar-button-dashboard.png`
Expected: Saved. (This route may redirect to login if not authenticated — that's still a valid screenshot.)

- [ ] **Step 7: Read the dashboard screenshot and verify**

Read: `/tmp/baazar-button-dashboard.png`
Verify: ghost-variant buttons (sidebar nav, etc.) render as transparent + ink text with `cream-soft` hover bg.

- [ ] **Step 8: If anything looks wrong, diagnose**

Common issues + fixes:

- **Pure-white background still visible** → check that the affected component isn't hardcoding `bg-white` or `bg-card` (since `--card` is mapped to cream now, `bg-card` should work; `bg-white` would not)
- **Black-not-ink text** → component hardcodes `text-black`
- **Sharp 0-radius corners on buttons** → the cva override didn't apply; check `rounded-md` is in the base class list
- **Hover doesn't lift** → likely a CSS specificity conflict from a parent's `transform`. Confirm by opening DevTools on a primary button and inspecting `:hover` state.

---

## Task 4: Update `DESIGN.md` with button + tooltip entries

**Files:**

- Modify: `DESIGN.md` — frontmatter `components` block (currently has `vendor-card-hover`, `site-preloader`, `vendor-gallery`)

- [ ] **Step 1: Read the current components block to know exact position**

Run: `grep -n "components:" /Users/sardarkhan/IdeaProjects/vendors.io/DESIGN.md | head -5`
Expected: a line number like `components:` near line ~91 in the YAML frontmatter. (If you've added entries since, the number shifts.)

- [ ] **Step 2: Add the two new entries to the frontmatter**

Append two new entries inside the `components:` block in `DESIGN.md` frontmatter, after the existing `vendor-gallery:` entry and before the YAML `---` end marker. Use the Edit tool with this addition (paste after the `vendor-gallery` block):

```yaml
button:
  pattern: 'Soft editorial — 6px corners, ink primary, -3px lift on hover'
  variants: 'primary (ink), secondary (outline-ink), tertiary (ghost), link (text + underline-on-hover), destructive (error)'
  sizes: 'sm (32px), md (40px default), lg (48px)'
  hover: 'translateY(-3px) + variant-tinted shadow + slight bg darken — shares -3px lift family with vendor-card-hover (HV-B)'
  focus: '2px outline in colors.indigo at 2px offset (colors.error for destructive)'
  motion: '220ms — slightly faster than motion.medium (320ms) for snappier interactive response'
  api: 'iconLeading + iconTrailing slots; asChild via Radix Slot; isLoading replaces children with inline spinner; backwards-compat aliases for default/outline/ghost variant names'
  accessibility: 'WCAG AA on all variant×state combos. Icon-only requires aria-label.'
  destructive: 'NEVER delete-on-first-click — consumers wire to a confirmation primitive (typed-confirm for high-stakes, single-tap for low-stakes)'
tooltip:
  pattern: 'Radix-based, opt-in. Wraps icon-only Buttons (and any interactive element) when a hover-label is needed.'
  surface: 'ink panel with cream text, 4px corners (tighter than buttons to signal a different layer)'
  typography: 'caption token — 12px / 500 / Schibsted Grotesk'
  timing: '400ms open delay, 100ms close, 150ms fade-in (motion.ease-out)'
  api: "<Tooltip content='...'>{trigger}</Tooltip>"
```

- [ ] **Step 3: Verify the YAML still parses**

Run: `head -120 /Users/sardarkhan/IdeaProjects/vendors.io/DESIGN.md | grep -E '^---$'`
Expected: at least two `---` lines (frontmatter open + close). If only one, the frontmatter is broken.

Run: `npm run dev 2>&1 | tail -5` (already running) — verify Next.js doesn't error on the markdown change. (Markdown frontmatter doesn't affect Next compilation, but a YAML parse error in another tool that reads DESIGN.md would.)

---

## Task 5: Final verification + commit

- [ ] **Step 1: Re-run typecheck and lint together**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 2: Run the existing test suite**

Run: `npm run test`
Expected: existing tests pass (no React component tests touched). If any test references the button component imports differently, fix.

- [ ] **Step 3: Final visual confirmation**

Run: `node /Users/sardarkhan/IdeaProjects/vendors.io/.shot.mjs http://localhost:3000/ /tmp/baazar-button-final.png`
Read: `/tmp/baazar-button-final.png`
Verify the homepage still looks brand-correct and the new primary button renders with -3px lift on hover (you'll only see the lift in a follow-up screenshot — actual hover requires Playwright `page.hover()`; for now, default state is enough).

- [ ] **Step 4: Stage and review changes**

Run: `git status`
Expected: modified `src/components/ui/button.tsx`, new `src/components/ui/tooltip.tsx`, modified `package.json` + `package-lock.json` (for `@radix-ui/react-tooltip`), modified `DESIGN.md`.

Run: `git diff src/components/ui/button.tsx | head -100`
Verify the diff is the intended rewrite.

- [ ] **Step 5: Commit**

Stage:

```bash
git add src/components/ui/button.tsx src/components/ui/tooltip.tsx package.json package-lock.json DESIGN.md docs/superpowers/specs/2026-05-23-baazar-button-design.md docs/superpowers/plans/2026-05-23-baazar-button.md
```

Commit:

```bash
git commit -m "$(cat <<'EOF'
feat(button): Baazar M+ button + tooltip primitives

Rewrites src/components/ui/button.tsx with the design locked in
docs/superpowers/specs/2026-05-23-baazar-button-design.md:
- 5 variants (primary/secondary/tertiary/link/destructive) replacing
  shadcn's 6, with backwards-compat aliases (default→primary,
  outline→secondary, ghost→tertiary)
- 3 sizes (sm/md/lg) with alias for default/icon
- -3px lift hover (shares motion family with HV-B vendor card hover)
- Loading spinner, iconLeading/iconTrailing slots, icon-only auto-detect
- Dev console warnings for alias usage; console.error for missing
  aria-label on icon-only

Adds src/components/ui/tooltip.tsx as a Radix-based opt-in primitive
for pairing with icon-only buttons (ink panel, cream text, 400ms open
delay).

Updates DESIGN.md frontmatter with button + tooltip entries.

All 45 existing Button consumers continue to render unchanged via
the alias normalizer. A follow-up rename PR (see spec §8) will
migrate consumers to the new names.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Run: `git status`
Expected: clean tree, one new commit.

---

## Out of scope (deferred)

- **Codebase rename PR** (44 variant + 23 size call-sites): aliases keep the codebase working; rename is a separate cleanup PR. See spec §8.
- **React component unit tests**: codebase has zero `@testing-library/react` setup today; adding it just for the button is out of scope.
- **Storybook entry**: project does not use Storybook. Validation = Playwright visual screenshots.
- **Confirmation-primitive integration**: destructive buttons trigger confirmations but the confirmation primitive itself is a future brainstorm.
- **`<IconButton>` convenience wrapper**: deferred until we hit a concrete pain point repeating the `<Tooltip><Button /></Tooltip>` pattern.
- **Cycling-wordmark on every page**: separate task.
