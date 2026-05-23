# Baazar Button — Component Design

## 0. Status

- **Type**: Component-level design (not a sub-project). First component locked in the Baazar M+ brand rollout.
- **Origin**: Day-1 brand work brainstorm queue, item #1 of 6. Follows the brand foundation lock (palette M+, typography TY-C, motion + interaction tokens — see [`DESIGN.md`](../../../DESIGN.md)).
- **Build approach**: Extend the existing shadcn button at `src/components/ui/button.tsx`. Single PR, no migration in this PR (consumers stay on shadcn variant names via aliases — see §8).
- **Sequencing**: Unblocks the rest of the component brainstorm queue (search bar, filter chips, vendor card, footer, date picker) since most of those compose buttons.

## 1. Goals

Lock the canonical Baazar button component — the most-used interactive element in the marketplace. Every CTA on the homepage, vendor profile, inquiry flow, CRM, and onboarding wizard funnels through this primitive.

### Success criteria

1. **Five variants** rendered correctly in M+ palette: `primary`, `secondary`, `tertiary`, `link`, `destructive`. Role discipline matches [`DESIGN.md`](../../../DESIGN.md) — ink owns CTAs, indigo owns chrome/focus, error owns destructive, no haldi or hot-pink as button fills.
2. **Three sizes**: `sm` (32px tall), `md` (40px, default), `lg` (48px).
3. **Five states per variant**: default, hover, focus, disabled, loading. Hover signature = `translateY(-3px)` + drop shadow + slight darken — same -3px lift as the locked HV-B vendor card hover, so buttons and cards share one motion vocabulary.
4. **Icon slots**: `iconLeading` and `iconTrailing` props. Icon-only mode (square, equal padding) when component renders without text children.
5. **Polymorphic via `asChild`**: wraps a `Link` or any other component without DOM-nesting issues (Radix `Slot` pattern — already in place).
6. **Backwards-compatible**: every existing `<Button>` consumer keeps working without code changes. Old variant names (`default`, `outline`, `ghost`) map to new variants via aliases.
7. **Accessible**: WCAG AA contrast on every variant + state, visible keyboard focus ring (`--ring` = indigo), `prefers-reduced-motion` honored (no lift, no shadow growth).
8. **No new dependencies**: builds on existing `class-variance-authority`, `@radix-ui/react-slot`, `tailwindcss-animate`. No `react-aria-components`, no UUI fork.

### Acceptance criteria

A developer using the new `<Button>`:

- Writes `<Button>Browse vendors</Button>` and gets a 40px ink-on-cream primary button with the locked hover lift.
- Writes `<Button variant="secondary" size="lg" iconTrailing={ArrowRight}>Continue</Button>` and gets a 48px outlined-ink button with a trailing chevron + 6px gap.
- Writes `<Button variant="destructive" isLoading>Delete photo</Button>` and gets an error-fill button with an inline spinner replacing the label text.
- Writes `<Button asChild><Link href="/vendors">Browse</Link></Button>` and gets a styled anchor with no nested `<button>` warnings.
- Writes `<Button variant="outline">Cancel</Button>` (legacy name) and gets the same render as `variant="secondary"` — no visual regression.

### Out of scope (deferred)

| Area                                                     | Disposition                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Migrate every existing consumer to the new variant names | Out — aliases keep old names working. A grep-and-rename migration is a separate cleanup PR. |
| Button group / segmented control (`ToggleGroup`)         | Out — that's its own component (filter chips queue item #3).                                |
| Floating action button                                   | Out — not in the design system.                                                             |
| Pulse/loading-shimmer effects on idle buttons            | Out — the brand is bold-not-loud; no idle animations.                                       |
| Right-to-left layout (icon swap on RTL)                  | Out — not yet supporting Arabic/Urdu/Persian as UI languages, only as wordmark scripts.     |
| Theme variants (dark mode buttons)                       | Out — DESIGN.md anti-reference is "not dark-mode marketplace."                              |

## 2. Component API

### Props

```ts
type ButtonVariant =
  | 'primary' // canonical CTA — ink fill
  | 'secondary' // outline ink — alt CTA / cancel
  | 'tertiary' // ghost text — inline actions
  | 'link' // text-only, underline on hover
  | 'destructive' // error fill — delete / dangerous
  // Aliases (kept for backwards compat — emit a console.warn in dev only):
  | 'default' // → 'primary'
  | 'outline' // → 'secondary'
  | 'ghost'; // → 'tertiary'

type ButtonSize =
  | 'sm' // 32px tall
  | 'md' // 40px tall (default)
  | 'lg' // 48px tall
  // Aliases:
  | 'default' // → 'md'
  | 'icon'; // → 'md' + auto icon-only when no children

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // default: 'primary'
  size?: ButtonSize; // default: 'md'
  asChild?: boolean; // default: false — Radix Slot polymorphism
  isLoading?: boolean; // default: false — shows spinner, disables interaction
  showTextWhileLoading?: boolean; // default: false — keep label visible alongside spinner
  iconLeading?: React.ComponentType<{ className?: string }> | React.ReactNode;
  iconTrailing?: React.ComponentType<{ className?: string }> | React.ReactNode;
}
```

### Render contract

- When `isLoading` is true:
  - Spinner renders in place of (or alongside, if `showTextWhileLoading`) the children.
  - Button is implicitly `disabled`. Pointer events disabled. Click handler not called.
- When neither `children` nor `iconLeading`/`iconTrailing` is text-content, button auto-detects icon-only mode and renders a square (width = height) with equal padding.
- `asChild` swaps the rendered element from `<button>` to the single child (typically `<Link>` or `<a>`). All Tailwind classes are forwarded.

## 3. Variants — visual specs

All variants use:

- **Font**: `font-sans` (Schibsted Grotesk via `--font-body`)
- **Weight**: 500 (font-medium)
- **Corner radius**: 6px (`rounded-md`, per DESIGN.md `radii.md`)
- **Transition**: `all 220ms cubic-bezier(.22, 1, .36, 1)` — `motion.ease-out` family

### `primary` — ink fill (the canonical CTA)

| State    | Background                  | Text                     | Border | Transform / Shadow                                                                             |
| -------- | --------------------------- | ------------------------ | ------ | ---------------------------------------------------------------------------------------------- |
| Default  | `colors.ink` (#1B1414)      | `colors.cream` (#FBF6EC) | none   | flat                                                                                           |
| Hover    | `#2A1E1E` (ink ~9% lighter) | cream                    | none   | `translateY(-3px)` + `0 8px 20px rgba(27,20,20,0.25), 0 3px 6px rgba(27,20,20,0.12)`           |
| Focus    | ink                         | cream                    | none   | `outline: 2px solid colors.indigo; outline-offset: 2px;` (also when focus-visible after click) |
| Disabled | ink                         | cream                    | none   | `opacity: 0.4; pointer-events: none; cursor: not-allowed;`                                     |
| Loading  | ink                         | cream                    | none   | spinner inline; pointer events disabled                                                        |

**Rule:** This is the ONLY variant that gets primary CTA placement. Never use pink, never use haldi as a CTA fill.

### `secondary` — outline ink (alt CTA, cancels, sub-actions)

| State    | Background                    | Text         | Border                 | Transform / Shadow                                                                                                 |
| -------- | ----------------------------- | ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Default  | transparent                   | `colors.ink` | `1px solid colors.ink` | flat                                                                                                               |
| Hover    | `colors.cream-soft` (#F4ECDC) | ink          | `1px solid ink`        | `translateY(-3px)` + `0 6px 14px rgba(27,20,20,0.10), 0 2px 4px rgba(27,20,20,0.05)` (lighter shadow than primary) |
| Focus    | transparent                   | ink          | ink                    | `outline: 2px solid colors.indigo; outline-offset: 2px;`                                                           |
| Disabled | transparent                   | ink          | ink                    | `opacity: 0.4` + no events                                                                                         |
| Loading  | transparent                   | ink          | ink                    | spinner inline                                                                                                     |

### `tertiary` — ghost (inline actions, dense surfaces)

| State    | Background          | Text         | Border | Transform / Shadow                                       |
| -------- | ------------------- | ------------ | ------ | -------------------------------------------------------- |
| Default  | transparent         | `colors.ink` | none   | flat (12px horizontal padding for icon-row balance)      |
| Hover    | `colors.cream-soft` | ink          | none   | NO LIFT (intentional — keeps dense layouts calm)         |
| Focus    | transparent         | ink          | none   | `outline: 2px solid colors.indigo; outline-offset: 2px;` |
| Disabled | transparent         | ink          | none   | `opacity: 0.4`                                           |
| Loading  | transparent         | ink          | none   | spinner inline                                           |

### `link` — text-only with underline-on-hover (inline CTAs in copy)

| State    | Background  | Text         | Border | Underline                                                                                 |
| -------- | ----------- | ------------ | ------ | ----------------------------------------------------------------------------------------- |
| Default  | transparent | `colors.ink` | none   | none                                                                                      |
| Hover    | transparent | ink          | none   | `text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px;` |
| Focus    | transparent | ink          | none   | underline + `outline: 2px solid colors.indigo; outline-offset: 2px;`                      |
| Disabled | transparent | ink          | none   | `opacity: 0.4`, no underline                                                              |
| Loading  | transparent | ink          | none   | spinner inline, no underline                                                              |

**Distinction from inline `<a>` body links:** body `<a>` tags will render in indigo + underline (per DESIGN.md role discipline — indigo owns system chrome). The `link` Button variant is ink because it functions as a CTA, not as a navigation hint inside running copy.

### `destructive` — solid error fill (delete, cancel booking)

| State    | Background               | Text           | Border | Transform / Shadow                                                                                               |
| -------- | ------------------------ | -------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Default  | `colors.error` (#B81628) | `colors.cream` | none   | flat                                                                                                             |
| Hover    | `#94121F` (error darker) | cream          | none   | `translateY(-3px)` + `0 8px 20px rgba(184,22,40,0.30), 0 3px 6px rgba(184,22,40,0.15)` (error-tinted shadow)     |
| Focus    | error                    | cream          | none   | `outline: 2px solid colors.error; outline-offset: 2px;` (focus ring matches the variant for clarity, not indigo) |
| Disabled | error                    | cream          | none   | `opacity: 0.4`                                                                                                   |
| Loading  | error                    | cream          | none   | spinner inline                                                                                                   |

**Never delete-on-first-click.** Consumers MUST wire destructive buttons to a confirmation primitive — typed-confirm (`type DELETE to confirm`) for high-stakes deletes (cancel booking, delete photo with bookings), single-tap-confirm for low-stakes (remove from saved list). The Button is the trigger; the confirmation is a separate primitive built later (separate brainstorm — likely when we touch the vendor CRM photo management surface). Pattern documented, not enforced by the component:

```tsx
<Button
  variant="destructive"
  onClick={() =>
    openConfirmDialog({
      title: 'Delete this photo?',
      body: 'Type DELETE to confirm. This cannot be undone.',
      confirmWord: 'DELETE',
      onConfirm: () => deletePhoto(photoId),
    })
  }
>
  Delete photo
</Button>
```

## 4. Sizes

| Size           | Height | Horizontal padding | Font size | Icon size |
| -------------- | ------ | ------------------ | --------- | --------- |
| `sm`           | 32px   | 14px               | 12px      | 14px      |
| `md` (default) | 40px   | 20px               | 13px      | 16px      |
| `lg`           | 48px   | 24px               | 14px      | 18px      |

Icon-only override (when no children): width = height, padding = `(height - icon size) / 2` for visual centering.

## 5. Icon slots

```tsx
// Leading icon
<Button iconLeading={Plus}>Add business</Button>

// Trailing icon
<Button variant="secondary" iconTrailing={ArrowRight}>Continue</Button>

// Icon-only (auto-detected when no children)
<Button variant="tertiary" iconLeading={Heart} aria-label="Save vendor" />

// Both
<Button iconLeading={Search} iconTrailing={ChevronDown}>Search Chicago</Button>
```

**Icon gap**: 6px between icon and text. Increases to 8px on `lg`.

**Icon-only accessibility**: when no children, an `aria-label` is required. The component should `console.error` in dev (not just dev-only — a silent fail makes a screen-reader-unusable button) if `aria-label` is missing and the button is icon-only.

## 5b. Tooltip pairing for icon-only buttons

`aria-label` covers screen readers; sighted users need a visible label too. **Pattern: opt-in.** Consumers explicitly wrap with `<Tooltip>` when they want a hover-label. The Button does NOT auto-wrap (would force a tooltip on every save heart on a vendor card, where context already makes the meaning obvious — noise).

```tsx
<Tooltip content="Save vendor">
  <Button variant="tertiary" iconLeading={Heart} aria-label="Save vendor" />
</Tooltip>
```

When in doubt: wrap with a tooltip. The cost is low; the readability gain for new users is high.

### Tooltip styling (Radix-based, M+ tokens)

Tooltips are intentionally distinct from buttons — they live in a different visual layer.

| Property       | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Background     | `colors.ink` (#1B1414)                                                               |
| Text           | `colors.cream`                                                                       |
| Font           | Schibsted Grotesk, `caption` token — 12px / 500 / 1.40                               |
| Padding        | `6px 10px`                                                                           |
| Corner radius  | `radii.sm` (4px) — tighter than buttons, signals "this is a different surface layer" |
| Arrow          | 6px ink triangle pointing to trigger                                                 |
| Shadow         | none — ink-on-cream contrast carries the layer separation                            |
| Open delay     | 400ms (Radix default 700ms is sluggish; instant feels jumpy)                         |
| Close delay    | 100ms                                                                                |
| Animation      | `opacity 0 → 1` over 150ms, `motion.ease-out`                                        |
| Position       | `top` default, falls back to `bottom` if no viewport space                           |
| Reduced motion | fade still applies (no transform involved); duration shortened to 50ms               |

### Future convenience wrapper (not in this PR)

If we find ourselves wrapping the same way repeatedly, ship a small `<IconButton>` convenience component that combines Button + Tooltip + `aria-label` enforcement:

```tsx
// Future — not in this spec
<IconButton icon={Heart} label="Save vendor" variant="tertiary" onClick={handleSave} />
```

Defer until we have a concrete pain point. For now: explicit `<Tooltip>` + `<Button>` pairs.

## 6. Tokens used

All values reference [`DESIGN.md`](../../../DESIGN.md) tokens. No magic numbers in the component.

| Token                                                           | Used by                                                                              | Tailwind class                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `colors.ink`                                                    | primary fill, secondary border + text, tertiary text, link text                      | `bg-ink`, `text-ink`, `border-ink`                                                  |
| `colors.cream`                                                  | primary text, destructive text                                                       | `text-cream`                                                                        |
| `colors.cream-soft`                                             | secondary hover bg, tertiary hover bg                                                | `bg-cream-soft`                                                                     |
| `colors.error`                                                  | destructive fill, destructive focus ring                                             | `bg-error`, `outline-error`                                                         |
| `colors.indigo`                                                 | focus ring (all non-destructive variants)                                            | `outline-indigo` (custom — see §7)                                                  |
| `radii.md` (6px)                                                | corner radius all variants                                                           | `rounded-md`                                                                        |
| `motion.medium` (320ms)                                         | NOT used — buttons use 220ms (slightly faster than card hover for snappier response) | n/a — inline `transition: all 220ms`                                                |
| `motion.ease-out`                                               | every transition                                                                     | `ease-out` (Tailwind default is close enough) or inline `cubic-bezier(.22,1,.36,1)` |
| `spacing.sm` (12px), `spacing.base` (16px), `spacing.md` (24px) | horizontal padding by size                                                           | inline `px-3.5`, `px-5`, `px-6`                                                     |

**New ad-hoc colors** (not in DESIGN.md, used only by this component): `ink-light: #2A1E1E` (primary hover background), `error-hover: #94121F` (destructive hover background). These are local mid-states; if reused elsewhere they get promoted to DESIGN.md.

## 7. Implementation approach

Extend the existing button at `src/components/ui/button.tsx`. Keep `cva` + Radix `Slot`. Add the new features without breaking the existing import surface.

### File-level changes

- `src/components/ui/button.tsx` — rewrite `buttonVariants` cva config; add `isLoading`, `showTextWhileLoading`, `iconLeading`, `iconTrailing` props; preserve `variant`/`size`/`asChild` API; add internal alias map (default→primary, outline→secondary, ghost→tertiary, default size→md, icon→md+auto-icon-only).
- `tailwind.config.ts` — add a custom `outline` utility for indigo focus rings (Tailwind's `outline` color is opt-in and limited). Specifically: add `--ring` is already mapped to indigo, so `outline-ring` would work; but `focus-visible:outline-ring` may not compose. Verify on implementation.
- No `globals.css` changes.

### `buttonVariants` config sketch (cva)

```ts
const buttonVariants = cva(
  // Base — applies to all variants
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'font-sans font-medium rounded-md',
    'transition-all duration-[220ms] ease-[cubic-bezier(.22,1,.36,1)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
    'disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-ink text-cream hover:bg-[#2A1E1E] hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(27,20,20,0.25),0_3px_6px_rgba(27,20,20,0.12)]',
        secondary:
          'bg-transparent text-ink border border-ink hover:bg-cream-soft hover:-translate-y-[3px] hover:shadow-[0_6px_14px_rgba(27,20,20,0.10),0_2px_4px_rgba(27,20,20,0.05)]',
        tertiary: 'bg-transparent text-ink hover:bg-cream-soft',
        link: 'bg-transparent text-ink h-auto p-0 hover:underline hover:underline-offset-4 hover:decoration-1',
        destructive:
          'bg-error text-cream hover:bg-[#94121F] hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(184,22,40,0.30),0_3px_6px_rgba(184,22,40,0.15)] focus-visible:ring-error',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs gap-1',
        md: 'h-10 px-5 text-[13px]',
        lg: 'h-12 px-6 text-sm gap-2',
      },
    },
    compoundVariants: [
      // Icon-only — equal padding
      { variant: 'tertiary', size: 'sm', class: 'data-[icon-only]:px-0 data-[icon-only]:w-8' },
      { variant: 'tertiary', size: 'md', class: 'data-[icon-only]:px-0 data-[icon-only]:w-10' },
      { variant: 'tertiary', size: 'lg', class: 'data-[icon-only]:px-0 data-[icon-only]:w-12' },
      // Same for primary/secondary/destructive — abbreviated
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);
```

### Loading spinner

Inline SVG, 14px square, `border` style with one transparent quadrant + CSS `animation: spin 700ms linear infinite`. Renders in `currentColor` so it picks up the variant's text color automatically.

### Alias handling

A tiny normalizer at the top of the component:

```ts
const VARIANT_ALIASES: Record<string, ButtonVariant> = {
  default: 'primary',
  outline: 'secondary',
  ghost: 'tertiary',
};
const SIZE_ALIASES: Record<string, ButtonSize> = {
  default: 'md',
};

// In component:
const resolvedVariant = VARIANT_ALIASES[variant] ?? variant;
const resolvedSize = SIZE_ALIASES[size] ?? size;
// `size === 'icon'` flips the data-icon-only attribute even if children are present
```

Dev-only `console.warn` when an alias is used: `[Button] variant="outline" is deprecated. Use variant="secondary" instead.`

## 8. Migration plan

44 existing variant usages + 23 size usages in the codebase. Strategy:

1. **This PR**: ship new variants + aliases for old names. Zero consumer changes required. All 44 sites keep working. Console warnings appear in dev.
2. **Follow-up PR (optional, can be deferred)**: grep + rename across the codebase. Suggested sed pattern:
   ```bash
   # variants
   sed -i 's/variant="default"/variant="primary"/g' $(grep -rl 'variant="default"' src --include='*.tsx')
   sed -i 's/variant="outline"/variant="secondary"/g' $(grep -rl 'variant="outline"' src --include='*.tsx')
   sed -i 's/variant="ghost"/variant="tertiary"/g' $(grep -rl 'variant="ghost"' src --include='*.tsx')
   # secondary → tertiary (only 1 occurrence — verify manually first)
   sed -i 's/variant="secondary"/variant="tertiary"/g' $(grep -rl 'variant="secondary"' src --include='*.tsx')
   # sizes
   sed -i 's/size="default"/size="md"/g' $(grep -rl 'size="default"' src --include='*.tsx')
   sed -i 's/size="icon"/size="md"/g' $(grep -rl 'size="icon"' src --include='*.tsx')
   ```
3. **Cleanup PR**: remove the alias map + dev warnings.

Current variant census from the codebase (for tracking):

| Old name      | Count | Maps to                                       |
| ------------- | ----- | --------------------------------------------- |
| `outline`     | 31    | `secondary`                                   |
| `ghost`       | 7     | `tertiary`                                    |
| `destructive` | 2     | `destructive` (same)                          |
| `default`     | 2     | `primary`                                     |
| `secondary`   | 1     | `tertiary` (was a tinted fill; closest match) |
| `link`        | 1     | `link` (same)                                 |

## 9. Accessibility

- **Keyboard**: every variant focusable. Focus-visible ring is `2px solid indigo` (or `error` for destructive) at `2px` offset on `cream` background — passes WCAG focus indicator requirements.
- **Color contrast**: all five variants × 5 states pass WCAG AA at the relevant text size. Locked in DESIGN.md accessibility section (ink-on-cream 14.5:1; cream-on-ink same inverted; cream-on-error verified at implementation).
- **Loading state**: `aria-busy="true"`, `aria-disabled="true"`. Spinner has `aria-hidden="true"` (it's decorative; the busy state is announced via attributes).
- **Icon-only**: `aria-label` required. Component logs an error in dev if missing.
- **`prefers-reduced-motion`**: when set, `transform` and `transition` are disabled. Hover keeps the bg-color shift and the shadow (those communicate state without movement). Implementation: `@media (prefers-reduced-motion: reduce)` rule in component-scoped CSS or global utility class.

## 10. DESIGN.md updates

Add the `button` entry to the `components` frontmatter block in [`DESIGN.md`](../../../DESIGN.md):

```yaml
components:
  # (existing entries — vendor-card-hover, site-preloader, vendor-gallery)
  button:
    pattern: 'Soft editorial — 6px corners, ink primary, -3px lift on hover'
    variants: 'primary (ink), secondary (outline-ink), tertiary (ghost), link (text + underline-on-hover), destructive (error)'
    sizes: 'sm (32px), md (40px default), lg (48px)'
    hover: 'translateY(-3px) + variant-tinted shadow + slight bg darken — shares -3px lift family with vendor-card-hover (HV-B)'
    focus: '2px outline in colors.indigo at 2px offset (colors.error for destructive)'
    motion: '220ms — slightly faster than motion.medium (320ms) for snappier interactive response'
    api: 'iconLeading + iconTrailing slots; asChild via Radix Slot; isLoading replaces children with inline spinner'
    accessibility: 'WCAG AA on all variant×state combos. Icon-only requires aria-label.'
    destructive: 'NEVER delete-on-first-click — consumers wire to a confirmation primitive (typed-confirm for high-stakes, single-tap for low-stakes)'
  tooltip:
    pattern: 'Radix-based, opt-in. Wraps icon-only Buttons (and any interactive element) when a hover-label is needed.'
    surface: 'ink panel with cream text, 4px corners (tighter than buttons to signal a different layer)'
    typography: 'caption token — 12px / 500 / Schibsted Grotesk'
    timing: '400ms open delay, 100ms close, 150ms fade-in (motion.ease-out)'
    api: "<Tooltip content='...'>{trigger}</Tooltip>"
```

Add a prose section under "Motion + interaction patterns" or its own H2 once we have 2+ component-level locks (search bar will be the second).

## 11. Testing

### Visual regression

- Storybook entry (`Button.stories.tsx`) rendering every variant × size × state combination as a grid.
- Chromatic / Playwright screenshot of the grid in CI on every PR touching `button.tsx`, `globals.css`, or `tailwind.config.ts`.

### Unit (vitest + Testing Library)

- `<Button>` renders with default variant + size.
- `<Button isLoading>` is `aria-busy`, `aria-disabled`, has no click handler invocation.
- `<Button asChild><a>Link</a></Button>` renders an `<a>` not a `<button>`.
- `<Button iconLeading={X} aria-label="Save" />` (no children) auto-applies icon-only sizing.
- Alias `<Button variant="outline">` renders identical classes to `variant="secondary"`.

### Accessibility

- `axe-core` smoke test on the Storybook grid.
- Manual: tab through every variant, confirm focus ring is visible on `cream` background.

## 12. Related

- [`DESIGN.md`](../../../DESIGN.md) — palette M+, typography TY-C, motion tokens, HV-B vendor card hover (shares -3px lift family).
- [Sub-project E vendor CRM](./2026-05-20-sub-project-e-vendor-dashboard-crm-design.md) — heaviest consumer of `Button`. Will benefit from new variants once migration PR ships.
- Component brainstorm queue items #2–6 (search bar, filter chips, vendor card layout, footer, date picker) all compose `Button` — locking this first unblocks the rest.
