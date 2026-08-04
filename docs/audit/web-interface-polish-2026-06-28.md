# Web Interface Polish audit — 2026-06-28

**Skill source:** `make-interfaces-feel-better` — design engineering principles for making interfaces feel polished (concentric border radius, optical alignment, shadows over borders, image outlines, scale on press, interruptible/staggered/subtle animations, tabular numbers, text wrapping, hit areas, etc.).
**Audit basis:** Branch `fix/web-guidelines-systemic-patterns` (PR #72) — the post-a11y-cleanup state. Polish findings represent the design-quality layer on top of the a11y baseline.
**Coverage approach:** 5 parallel review agents (primitives, cards+media, forms+wizards, marketplace+search, dashboard+animation).
**Findings volume:** ≈200 individual items, mostly in markdown tables.

## How to use this document

1. **Read the [Systemic patterns](#systemic-patterns) section first.** Many findings cascade from primitive fixes — e.g. adding `active:scale-[0.96]` to the `Button` base catches every CTA in the app at once.
2. **Then triage [Per-area findings](#per-area-findings).** Each section is a Before/After table grouped by design principle.
3. Each row cites the file + line where it isn't obvious from the snippet.

Suggested priority tagging:

- **P0** = base-class / primitive cascades that hit 20+ places at once (Button scale, Dialog radius, image-outline on Avatar, transition-all in Tabs/Sheet).
- **P1** = sweep-style additive polish (image outlines, tabular-nums, text-balance/pretty, hit-area expansion).
- **P2** = per-component structural changes (stagger enter, asymmetric exits, contextual icon animations, shadows-over-borders, concentric radius fixes).
- **P3** = optical alignment + `will-change` audit + last-mile detail work.

---

## Systemic patterns

### P0 — primitive cascades (one change fixes many)

- **`Button` base in `src/components/ui/button.tsx`** — currently `transition-all duration-[180ms] ease-out`, no `active:scale-[0.96]`. Fix base → catches every CTA app-wide (auth submits, wizard Next, all dialog Confirms, dashboard form Saves, marketplace actions, banner CTAs, etc. ~30+ sites).
- **`Dialog` base in `src/components/ui/dialog.tsx`** — `sm:rounded-lg` (8px) + `border` + symmetric `duration-200`. Promote to `sm:rounded-2xl`, drop hard border, asymmetric durations (enter 300ms / exit 150ms). Cascade: every dialog including ConfirmDialog gets concentric radius + softer chrome.
- **`Sheet` base in `src/components/ui/sheet.tsx`** — bare `transition ease-in-out` (anti-pattern) + directional `border-b/-t/-l/-r`. Replace transition with explicit `transition-[transform,opacity]`, drop directional borders for shadow.
- **`Tabs` base in `src/components/ui/tabs.tsx`** — `TabsTrigger` uses `transition-all`. Replace with `transition-[color,background-color,box-shadow]`.
- **`Avatar` primitive in `src/components/ui/avatar.tsx`** — no image outline. Add `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10`. Cascade: every dashboard avatar, every notification card avatar.
- **`Popover` / `DropdownMenu` / `Select`** — all have `border bg-popover ... shadow-md` (hard hairline competing with the shadow). Drop borders, lean on layered shadows.
- **`Dialog` / `Sheet` close ×** — both wrap an `h-4 w-4` X in `rounded-sm` with no padding, ~16×16 hit target. Bump to `size-10` (40×40) with negative margin to preserve visual offset.
- **`Switch` Root** — `h-5 w-9` (20×36) is below the 40×40 minimum. Extend via `::before` pseudo-element without changing visual size.
- **`date-picker.tsx` arrows** — `button_previous`/`button_next` are `w-7 h-7` (28×28). Bump to `w-9 h-9` + pseudo-element extension.
- **`src/app/layout.tsx`** — verify `antialiased` is present on `<body>` for crisper text on macOS.

### P1 — sitewide sweeps (additive, low-risk)

- **Image outlines everywhere `<Image>` or `<img>` renders user content**: VendorCard hero, PackageGrid featured + custom-request placeholder, PackageDetailModal featured + gallery, PhotoCarouselHero slides, EventCard portfolio, PhotoThumbnailGrid thumbs (uploader + grid), PhotoUploaderDrawer closed-strip, UnclaimedVendorProfile hero, CategoryHoverExpand active tile, CategoryHoverExpandMobile grid, StepReview portfolio, StepReview preview, BookingForm package featured. Pattern: `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10`. **Never tinted neutrals — always pure black/10 or white/10.**
- **`tabular-nums` on every dynamic number**: char counters (StepBasics bio, CustomRequestForm description, CounterModal note, DisputeDialog reason, VendorNotesEditor notes), price columns (BookingStickyCard duration + SLA, BookingBottomBar duration, PackageGrid summary line, PackageDetailModal summary, VendorProfile rating + review count), count badges (Chip badge, AllFiltersSheet count, NotificationsPageClient group counts, NotificationCard timeAgo), input width (CapacityField, package number inputs, IG handle counters), remaining-counter ("N counter-offers remaining", "N adjustments remaining"), badge digits (NotificationBell, EventCardFilters tabs).
- **`text-balance` on headings** (multi-word, prone to widows): every wizard step `<h1>`, dialog `<h2>` step headings, UnclaimedVendorProfile vendor name, FirstBookingCelebration h2, BackfillBanner title, CustomerWelcomeBanner headline, marketplace hero h1, VendorProfile h1.
- **`text-pretty` on body `<p>`**: helper text under fields, dialog policy paragraphs (CancelDialog/DepositDialog), wizard helper copy, UnclaimedVendorProfile bio, NotificationCard expanded body, BackfillBanner body, all multi-sentence helpers across StepReview / StepBasics / StepLocation / VendorProfileForm / PackageEditorForm / BookingForm.
- **Hit-area expansion** on small icon-only buttons not covered by P0 primitives: VendorCard heart (34×34 → 40×40), PhotoCarouselHero heart (36→40), PhotoThumbnailGrid grip/star/X (20-32 → 40), PackageDetailModal native checkbox, StepBasics dismiss (12×12 → 40), BioAssistCard dismiss, PackageAddonsEditor remove (36 → 40), EventRow remove (text-only → padded), CustomRequestForm remove/add (text-only → padded), StepReview Edit links (28 → 40), AllFiltersSheet close (32 → 40), Chip remove (16 → 40 via `::before`), PanelShell close (24 → 40), NotificationBell wrapper (36 → 40), CustomerWelcomeBanner dismiss (18 → 40), BackfillBanner dismiss (36 → 40), NotificationCard action chips (32 → 40), NotificationDropdown text links (none → min-h-10), NotificationsPageClient "Mark all read".

### P2 — per-component structural

- **Shadows over borders** — replace hard `border-ink/10`, `border-hairline`, `border-cream`, `border-ink/15` separators with layered transparent `box-shadow`. Hit list:
  - Primitives: Dialog hard `border`, Sheet directional borders, Popover/DropdownMenu/Select hard borders + shadow combo.
  - Wizard / forms: prefill notice (StepBasics), amber 3+ photos banner (StepPortfolio), review summary cards (StepReview), publish-error/terms boxes (StepReview), BookingForm error block, CustomRequestForm error banner, BioAssistCard suggestion, VendorOnboarding sample rows.
  - Dashboard: SidebarNav active row (currently `bg-accent` only — needs depth), BackfillBanner, CustomerWelcomeBanner, CalendarHoldsList rows, BlockDateForm + CapacityField cards, VendorBookingActions border-primary/20, DepositDialog stacked panels (currently same-radius siblings).
  - Marketplace: BookingStickyCard separators + border-2, BookingBottomBar border-t-2, PackageGrid border-2 featured, EarningsCard divider, FilterChipRow header/footer separators, MobileSearchSheet footer, VendorProfile section dividers, OwnerBanner border-b, AllFiltersSheet panel border-l + header/footer borders.
- **Concentric border radius nesting fixes** (per-component, after primitive Dialog/Avatar cascade):
  - VendorCard `rounded-lg` outer + `rounded-full size-[34px]` inner heart needs outer bump.
  - PackageGrid `rounded-xl` outer + sharp image inner; image needs `rounded-t-[10px]` or parent `overflow-hidden`.
  - PackageDetailModal three-level nesting (modal/featured/gallery) needs hierarchy.
  - EventCard module CSS has INVERTED nesting (5px outer, 10px inner badge — flip).
  - BookingStickyCard `rounded-lg` + `rounded-md` deposit chip — promote outer to `rounded-2xl`.
  - NotificationCard nested overlay radius, NotificationDropdown first/last-item rounding to match shell.
  - CancelDialog warning + Input both `rounded-md` (no nesting) — promote warning to `rounded-lg`.
  - DepositDialog two stacked `rounded-md` panels (flat hierarchy) — bump one.
  - All form inputs (BookingForm, EventRow) using bare `rounded` (4px) inside `rounded-xl` Cards — bump to `rounded-md`.
  - signup-form role-picker `rounded-lg` inside `rounded-xl` Card — drop to `rounded-md`.

### P3 — last-mile detail

- **Contextual icon animations** (framer-motion `spring duration: 0.3 bounce: 0`):
  - Heart toggle (VendorCard, PhotoCarouselHero) — cross-fade filled/outline.
  - NotificationBell badge appear/disappear.
  - NotificationCard unread dot scale-out on read.
  - NotificationCard warning icon ⚠ enter.
  - PackageGrid "Most popular" badge conditional render.
  - NewsletterForm submit icon (Loader2 → Check → ArrowRight cross-fade).
  - NotificationsPageClient chevron right/down (rotate not swap).
  - PhotoThumbnailGrid Primary pill (`layoutId="primary-pill"` shared layout transition).
  - BioAssistCard idle ✨ → loading ⋯ → done ✓ (use Sparkles/Loader2/Check siblings, cross-fade with spring).
- **Split + stagger enter animations** (semantic chunks, ~100ms delay each):
  - PanelShell side panel mount.
  - NotificationDropdown reveal.
  - FirstBookingCelebration content (h2 → subtitle → 3-step explainer → CTA).
  - CustomerWelcomeBanner (headline → chip row).
  - HomepageHero (kicker → H1 → subhead → SearchBar → CTAs).
  - CategoryHoverExpand active tile reveal.
  - HomepageWordmarkPanel (kicker → wordmark → glyph row).
- **Subtle exit animations** (half-duration of enter, smaller delta):
  - Dialog primitive symmetric duration → enter 300ms / exit 150ms.
  - PanelShell unmount (when entrance added).
  - NotificationDropdown unmount.
  - CustomerWelcomeBanner dismiss.
  - PackageDetailModal close.
  - PhotoCarouselHero slide change.
  - PhotoUploaderDrawer strip fade.
  - SearchBar Panel (currently enter only, no exit).
  - FilterChipRow AnchoredPanel (currently enter only).
  - HomepageWordmarkPanel symmetric crossfade → asymmetric.
- **Optical over geometric alignment** — chevrons and arrows on:
  - BusinessSwitcher ChevronDown (push down 1px).
  - NotificationBell badge centering (`1` glyph left-shifted vs `9+`).
  - NotificationsPageClient ChevronRight/Down swap (push right-chevron `mr-0.5`).
  - BookingBottomBar ▲ glyph (`translate-y-[-1px]` or swap to lucide ChevronUp).
  - BookingStickyCard `→`/`↓` arrows (swap to ArrowRight/ChevronDown icon + `translate-y-px`).
  - VendorCard arrow orb (`pl-0.5` so visible arrow tip optically centers).
  - PackageGrid `→` trailing arrows + giant `?` glyph.
  - EventCard `→`/`←` link arrows (swap to ArrowRight/ArrowLeft).
  - VendorOnboarding/CoupleOnboarding "Continue →" (swap text-arrow for icon, `translate-x-[0.5px]`).
  - ForgotPasswordForm "← Back to sign in" (wrap arrow in `-translate-x-0.5`).
  - Chip dropdown chevrons (trim right padding `pr-3`).
  - Chip all-filters Sliders icon (tighten left padding).
  - SearchBar lens icon (`translate-x-[0.5px]`).
- **`AnimatePresence initial={false}`** on every motion surface added in P3 (PanelShell, NotificationDropdown, FirstBookingCelebration, etc.) — prevents flash on first paint.
- **`will-change` audit**:
  - HeartConfetti: add `willChange: 'transform, opacity'` inline (12 spans GPU-promoted). Drop on `onAnimationEnd`.
  - WordmarkCycle: add `willChange: 'opacity'` on inner span only (NOT wrapper).
  - Verify no `will-change: all` anywhere; verify `motion.div` instances aren't promoting layers unnecessarily.

---

## Per-area findings

### UI primitives + new wrappers

#### Concentric border radius

| Before                                                                                                                                                                                   | After                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/dialog.tsx:41` — outer `sm:rounded-lg` (8px) with `p-6` (24px), close at `rounded-sm` inset 16px → outer < inner+padding                                              | Outer `sm:rounded-2xl` (16px); close button `rounded-md` (6px) so 6 + ~10 inset ≈ 16 reads concentric               |
| `src/components/ui/ConfirmDialog.tsx:65` — inherits Dialog `sm:rounded-lg` with `p-6`; nested `Input` (`rounded-md` 6px) and confirm `Button` (`rounded-md`) — outer same/smaller radius | Promote `DialogContent` to `rounded-2xl`; leave `Input`/`Button` at `rounded-md` so 16/6 hierarchy reads concentric |

#### Shadows over borders

| Before                                                                                                           | After                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/dialog.tsx:41` — `border bg-background p-6 shadow-lg` (hard hairline + shadow doing same job) | Drop `border`; rely on layered `shadow-[0_24px_60px_-12px_rgba(0,0,0,0.25),0_8px_16px_-8px_rgba(0,0,0,0.15)]` |
| `src/components/ui/sheet.tsx:38-43` — `border-b` / `border-t` / `border-l` / `border-r` per side                 | Directional `shadow-[0_-12px_30px_-8px_rgba(0,0,0,0.18)]` etc.; shadows adapt to dark mode, hairlines don't   |
| `src/components/ui/popover.tsx:22` — `rounded-md border bg-popover ... shadow-md`                                | Drop `border`; bump to `shadow-[0_8px_24px_-6px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.10)]`            |
| `src/components/ui/dropdown-menu.tsx:49,66` — `border bg-popover ... shadow-lg`/`shadow-md`                      | Drop `border`; use same layered shadow tokens as popover                                                      |
| `src/components/ui/select.tsx:71` — `border bg-popover ... shadow-md`                                            | Drop `border`; shadow only                                                                                    |

#### Subtle exit animations

| Before                                                                                                           | After                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/components/ui/dialog.tsx:41` — `duration-200` applies to both `data-[state=open]` and `data-[state=closed]` | `data-[state=open]:duration-300 data-[state=closed]:duration-150` so exit is half the enter |

#### Image outlines

| Before                                                                                               | After                                                                            |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/components/ui/avatar.tsx:26` — `AvatarImage` has only `aspect-square h-full w-full`; no outline | Add `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10` |

#### Scale on press

| Before                                                                                                     | After                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/components/ui/button.tsx:10-14` — base `transition-all duration-[180ms]` but no `active:scale-[0.96]` | Add `active:scale-[0.96] motion-reduce:active:scale-100` to base |

#### Never `transition: all`

| Before                                                                         | After                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/components/ui/button.tsx:10` — `transition-all duration-[180ms] ease-out` | `transition-[color,background-color,border-color,box-shadow,transform] duration-[180ms] ease-out` |
| `src/components/ui/sheet.tsx:34` — bare `transition ease-in-out`               | `transition-[transform,opacity] ease-in-out`                                                      |
| `src/components/ui/tabs.tsx:32` — TabsTrigger `transition-all`                 | `transition-[color,background-color,box-shadow]`                                                  |

#### Minimum hit area

| Before                                                                                                  | After                                                                                         |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/components/ui/dialog.tsx:47-50` — `DialogPrimitive.Close` `rounded-sm` around `h-4 w-4` X → ~16×16 | `inline-flex size-10 items-center justify-center -m-2` (keeps visual offset, gives 40×40 tap) |
| `src/components/ui/sheet.tsx:64-67` — same pattern around `h-4 w-4` X                                   | Mirror: `inline-flex size-10 items-center justify-center -m-2`                                |
| `src/components/ui/date-picker.tsx:90-93` — `button_previous`/`button_next` `w-7 h-7` (28×28)           | Bump to `w-9 h-9` + `before:absolute before:-inset-1 before:content-['']`                     |
| `src/components/ui/switch.tsx:16` — `h-5 w-9` Switch root 20×36                                         | Extend via `relative before:absolute before:-inset-2 before:content-['']` so touch zone ≥40px |

### Cards + media

#### Concentric border radius

| Before                                                                                                                                                                           | After                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/components/marketplace/VendorCard.tsx:74` — outer `rounded-lg` (8px) + inner `rounded-full size-[34px]` heart 12px from edge; image sharp-cornered inside `overflow-hidden` | Outer → `rounded-2xl` (16px); inner pills stay `rounded-full`                                 |
| `src/components/marketplace/PackageGrid.tsx:124` — outer button `rounded-xl` + inner `<div aspect-[4/3]>` image with NO radius                                                   | Image wrapper → `rounded-t-[10px]` or set parent `overflow-hidden`                            |
| `src/components/marketplace/PackageDetailModal.tsx:81,117` — modal + featured `rounded-lg` + gallery `rounded` (3 different radii at 3 depths)                                   | Featured → `rounded-xl`, gallery thumbs → `rounded-lg` (or `rounded-md`), modal `rounded-2xl` |
| `src/components/marketplace/vendor-profile/BookingStickyCard.tsx:65,81` — outer `rounded-lg` + `p-5` + inner deposit chip `rounded-md`                                           | Outer → `rounded-2xl`; inner deposit panel `rounded-md`                                       |
| `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:78` — `rounded` (4px) page-counter badge                                                                        | Counter → `rounded-md`; consider `rounded-b-xl` on container                                  |
| `src/components/dashboard/EventCard.module.css:18,49,114,135` — `.content` 5px outer, `.badge` 10px inner — INVERTED hierarchy                                                   | Card → 14px, badge → 6px, description panel → 8px                                             |
| `src/components/notifications/NotificationCard.tsx:64` — stretched action `rounded-md` overlay inside `<li>` with no rounding; action buttons `rounded` 4px                      | Wrap `<li>` `rounded-xl`, overlay → `rounded-lg`, action chips → `rounded-md`                 |
| `src/components/dashboard/EarningsCard.tsx:42` — outer `rounded-lg` + `p-6`; flush KPI tiles no nesting demo                                                                     | Outer → `rounded-2xl`; if KPI tiles become surfaces, `rounded-lg`                             |
| `src/components/ui/PhotoThumbnailGrid.tsx:57` — thumb container `rounded-md`; overlay buttons `rounded-full p-2`                                                                 | Thumb → `rounded-lg` for proper nesting                                                       |
| `src/components/ui/PhotoUploaderDrawer.tsx:238` — closed-strip thumbs `rounded-md` inside flex row; trigger `rounded-md`                                                         | Strip thumbs → `rounded-lg`, trigger → `rounded-xl`                                           |

#### Image outlines

| Before                                                                                                       | After                                                                            |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/components/marketplace/VendorCard.tsx:86-95` — hero `<Image>` no outline                                | Add `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10` |
| `src/components/marketplace/PackageGrid.tsx:78,129-135` — featured + custom-request placeholder no outline   | Same outline                                                                     |
| `src/components/marketplace/PackageDetailModal.tsx:82-88,118-124` — featured + gallery thumbnails no outline | Same outline on both                                                             |
| `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:52-59` — carousel slides no outline         | Same outline (apply to wrapper to keep snap math clean)                          |
| `src/components/dashboard/EventCard.tsx:77-85` — portfolio `<img>` no outline                                | Same outline                                                                     |
| `src/components/ui/PhotoThumbnailGrid.tsx:60-67` — uploader thumbs no outline                                | Same outline                                                                     |
| `src/components/ui/PhotoUploaderDrawer.tsx:241-248` — closed-strip 56×56 thumbs no outline                   | Same outline                                                                     |

#### Minimum hit area

| Before                                                                                                     | After                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/components/marketplace/VendorCard.tsx:140` — heart `size-[34px]` (34×34)                              | `size-10` (40×40) or keep visual 34px + `::before` extension |
| `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:69` — heart `h-9 w-9` (36×36)             | `h-10 w-10`                                                  |
| `src/components/ui/PhotoThumbnailGrid.tsx:73-81` — grip handle `p-1` + `size-3` icon ≈ 20×20               | Wrap with `size-10` clickable area or extend via `::after`   |
| `src/components/ui/PhotoThumbnailGrid.tsx:84-91,93-100` — primary-star + remove-X `p-2` + `size-4` ≈ 32×32 | `p-3` for 40×40                                              |
| `src/components/marketplace/PackageDetailModal.tsx:141-146` — checkbox bare browser default ~16×16         | Custom 40×40 toggle or rely on label as full click area      |

#### Tabular numbers

| Before                                                                                                             | After                                        |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `src/components/marketplace/vendor-profile/BookingStickyCard.tsx:73,155` — `duration_hours` + `response_sla_hours` | Wrap value `<span className="tabular-nums">` |
| `src/components/marketplace/vendor-profile/BookingBottomBar.tsx:96-98` — `duration_hours` line                     | Add `tabular-nums`                           |
| `src/components/marketplace/PackageGrid.tsx:142-145` — duration · max_guests · events summary                      | Add `tabular-nums` to `<p>`                  |
| `src/components/marketplace/PackageDetailModal.tsx:93-96` — summary line                                           | Add `tabular-nums`                           |
| `src/components/notifications/NotificationCard.tsx:58` — `{timeAgo(...)}` ("2h", "12m")                            | Add `tabular-nums`                           |

#### Shadows over borders

| Before                                                                                                                           | After                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/components/marketplace/vendor-profile/BookingStickyCard.tsx:117,145` — `border-t border-ink/10` Socials/TrustRow separators | Drop borders; use `shadow-[inset_0_1px_0_rgba(27,20,20,0.04)]` softer rule |
| `src/components/dashboard/EarningsCard.tsx:100` — `border-t border-ink/10` ROI divider                                           | Replace with layered shadow on inner block or `bg-cream-soft` panel        |
| `src/components/marketplace/vendor-profile/BookingStickyCard.tsx:38,65` — `border-2 border-ink` plus `shadow-md`                 | Drop border, use stronger layered shadow                                   |
| `src/components/marketplace/vendor-profile/BookingBottomBar.tsx:30,50` — `border-t-2 border-ink` above safe-area bar             | `shadow-[0_-8px_24px_rgba(0,0,0,0.08)]` for softer floating bar            |
| `src/components/marketplace/PackageGrid.tsx:125` — `border-2 border-ink` on featured package                                     | `shadow-[0_0_0_2px_var(--ink)]` ring or layered shadow with hot-pink tint  |

#### Scale on press

| Before                                                                                          | After                                                                  |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/components/marketplace/VendorCard.tsx:69-77,140` — card Link + heart button no press scale | Add `active:scale-[0.98]` to card Link, `active:scale-[0.96]` to heart |
| `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:69` — heart button             | `active:scale-[0.96] transition-transform`                             |
| `src/components/marketplace/PackageGrid.tsx:115-126` — package card button                      | `active:scale-[0.98]`                                                  |
| `src/components/notifications/NotificationCard.tsx:96-108` — action chips (Approve/Decline)     | `active:scale-[0.96] transition-transform`                             |
| `src/components/dashboard/EarningsCard.tsx:67-74` — range pills                                 | `active:scale-[0.96] transition-transform`                             |
| `src/components/dashboard/EventCardFilters.tsx:36-48` — tab buttons                             | `active:scale-[0.96] transition-transform`                             |
| `src/components/marketplace/vendor-profile/BookingBottomBar.tsx:78-105` — package picker        | `active:scale-[0.98]`                                                  |
| `src/components/ui/PhotoUploaderDrawer.tsx:168-175,196-205,264-267` — Add-more/Done/trigger     | `active:scale-[0.96] transition-transform`                             |

#### Optical over geometric alignment

| Before                                                                                                    | After                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/components/marketplace/vendor-profile/BookingBottomBar.tsx:70` — `▲` glyph baseline-low next to text | Wrap in `<span className="inline-block translate-y-[-1px]">` or swap for lucide ChevronUp |
| `src/components/marketplace/vendor-profile/BookingStickyCard.tsx:50,95,104` — `→`,`↓` trailing arrows     | `gap-1.5` flex with `ArrowRight` icon `size-4` + `translate-y-px`                         |
| `src/components/marketplace/vendor-profile/BookingBottomBar.tsx:118` — "Request Booking →"                | Replace with `ArrowRight` icon `translate-y-[0.5px]`                                      |
| `src/components/marketplace/VendorCard.tsx:152-163` — `ArrowRight size-[18px]` orb                        | Add `pl-0.5` so arrow tip optically centers                                               |
| `src/components/marketplace/PackageGrid.tsx:99,151` — "Request a quote →" / "Book … →"                    | `ArrowRight` icon with `translate-y-px`                                                   |
| `src/components/marketplace/PackageGrid.tsx:79-81` — giant `?` glyph centered                             | `pl-1` on span (or `translate-x-[-2px]`)                                                  |
| `src/components/dashboard/EventCard.tsx:124,141` — `→`/`←` arrows inline with text                        | Swap to `ArrowRight`/`ArrowLeft` icons with vertical-align fix                            |

#### Contextual icon animations

| Before                                                                                               | After                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/VendorCard.tsx:147` — `<Heart fill={isSaved}>` instant class swap        | Cross-fade via framer `motion.span` keeping filled + outline both in DOM with `transition: { type: "spring", duration: 0.3, bounce: 0 }` |
| `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx:71-74` — heart toggle instant swap  | Same spring cross-fade                                                                                                                   |
| `src/components/marketplace/PackageGrid.tsx:110-114` — "Most popular" badge conditional render       | Wrap with `AnimatePresence`; animate `opacity 0→1, scale 0.25→1, blur 4px→0` spring bounce 0                                             |
| `src/components/notifications/NotificationCard.tsx:50-54` — `⚠` conditional on email_status='failed' | Cross-fade with `AnimatePresence`                                                                                                        |
| `src/components/notifications/NotificationCard.tsx:116-123` — unread blue dot conditional            | Animate enter/exit with spring scale + opacity                                                                                           |
| `src/components/ui/PhotoThumbnailGrid.tsx:68-71` — `Primary` pill only on `idx === 0`                | `AnimatePresence`/`layoutId="primary-pill"` shared-layout transition                                                                     |

#### Subtle exit animations

| Before                                                                                                                 | After                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/components/marketplace/PackageDetailModal.tsx:73-77` — uses Dialog primitive (inherits any Dialog enter/exit fix) | Once Dialog base ships asymmetric durations, this inherits                                   |
| `src/components/ui/PhotoUploaderDrawer.tsx:233-262` — closed-state strip appears/disappears no exit                    | Wrap in `AnimatePresence` with `exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}` |

### Forms + wizards

#### Concentric border radius

| Before                                                                                                                          | After                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/components/forms/BookingForm.tsx:261,276,297,320,339` — bare `rounded` (4px) on inputs inside Card `rounded-xl` + `p-6`    | `rounded-md` for all nested inputs                                        |
| `src/components/forms/EventRow.tsx:133,150,168,188,243` — bare `rounded` on date/time/venue inside `rounded-lg border p-4` row  | `rounded-md` for all nested inputs and at-vendor box                      |
| `src/components/onboarding/StepReview.tsx:203` — portfolio `<Image>` `rounded-md` inside review card `rounded-md` = same radius | Raise card to `rounded-lg`/`rounded-xl`, or drop image to `rounded` (4px) |
| `src/components/auth/signup-form.tsx:153,168` — role-picker `rounded-lg border-2 p-4` inside Card `rounded-xl` p-6              | Role buttons → `rounded-md` for clear nesting                             |

#### Shadows over borders

| Before                                                                                                                               | After                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/components/onboarding/StepBasics.tsx:164` — prefill notice `border-ink/15 bg-cream/60`                                          | Drop border, `shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)]` |
| `src/components/onboarding/StepPortfolio.tsx:64` — amber banner `border-amber-500/30 bg-amber-500/10`                                | Replace border with warm shadow; keep bg tint                                 |
| `src/components/onboarding/StepReview.tsx:92,118,147,184,266,283` — review summary + publish-error + terms boxes `rounded-md border` | Replace `border` with `shadow-sm`                                             |
| `src/components/forms/BookingForm.tsx:350` — error `rounded-lg border border-destructive`                                            | Tinted bg + soft red-tinted shadow                                            |
| `src/components/booking/CustomRequestForm.tsx:132` — `rounded-md border border-haldi/40 bg-haldi/10`                                 | Replace haldi border with diffuse shadow                                      |
| `src/components/onboarding/BioAssistCard.tsx:143` — `border-ink/20 bg-cream p-3` AI suggestion                                       | Drop border, use shadow                                                       |
| `src/components/onboarding/VendorOnboarding.tsx:114` — sample-request rows `border-ink/15 bg-cream p-4`                              | Replace border with `shadow-sm`                                               |

#### Contextual icon animations

| Before                                                                                                          | After                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/onboarding/BioAssistCard.tsx:31-33,139` — idle "✨" → loading "⋯" → done via swapped emoji text | Render `Sparkles`/`Loader2`/`Check` as siblings, framer cross-fade with `scale 0.25→1, opacity 0→1, blur 4px→0` spring bounce 0 |
| `src/components/onboarding/BioAssistCard.tsx:146,154` — `<Sparkles>` + dismiss `<X>` static swap                | Wrap card mount in framer fade+scale; cross-fade header icon complete→error                                                     |

#### Tabular numbers

| Before                                                                                                                               | After                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `src/components/booking/CustomRequestForm.tsx:260` — `{description.length} / 1000` counter                                           | Add `tabular-nums`           |
| `src/components/forms/PackageEditorForm.tsx:165-186,196-218` — numeric inputs (base_price, max_guests, duration_hours, events_count) | Add `tabular-nums` to inputs |
| `src/components/forms/PackageAddonsEditor.tsx:62-72` — per-add-on dollar input                                                       | Add `tabular-nums`           |
| `src/components/onboarding/StepDetails.tsx:138-151` — years input (uses `font-mono`)                                                 | Add explicit `tabular-nums`  |

#### Text wrapping

| Before                                                                                                                                                                                | After                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `src/components/onboarding/StepBasics.tsx:102,StepLocation.tsx:79,StepOnline.tsx:53,StepDetails.tsx:89,StepPortfolio.tsx:47,StepReview.tsx:83` — wizard step `<h1>` no `text-balance` | Add `text-balance` to every wizard h1 |
| `src/components/onboarding/VendorOnboarding.tsx:54,108,CoupleOnboarding.tsx:105,178` — dialog `<h2>` step headings                                                                    | Add `text-balance`                    |
| `src/components/onboarding/StepBasics.tsx:192-196,StepLocation.tsx:140-156,StepReview.tsx:84-87,214-217,222-224,284-288` — multi-line helper paragraphs                               | Add `text-pretty`                     |
| `src/components/forms/PackageEditorForm.tsx:220-222,290-292,VendorProfileForm.tsx:223-226,BookingForm.tsx:389` — multi-sentence helpers/disclaimers                                   | Add `text-pretty`                     |

#### Image outlines

| Before                                                                    | After                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/components/onboarding/StepReview.tsx:197-204` — portfolio thumbnails | Add `outline outline-1 outline-black/10 dark:outline-white/10 -outline-offset-1` |
| `src/components/forms/BookingForm.tsx:175-178` — package featured Image   | Same outline                                                                     |

#### Never `transition: all`

| Before                                                                                                                  | After                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/components/onboarding/StepReview.tsx:229` — preview-trigger `transition hover:ring-ink/30` (bare transition = all) | `transition-[box-shadow,outline-color]` or `transition-colors` |

#### Scale on press

| Before                                                                                                                                                                                                                                                                     | After                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/components/ui/button.tsx:9` — Button base lacks `active:scale-[0.96]` (cascades to LoginForm, signup-form, ForgotPasswordForm, ResetPasswordForm, all Step\* Next/Continue/Save/Publish, PackageEditorForm Create/Update, VendorProfileForm Save, BookingForm Submit) | Add `transition-transform active:scale-[0.96]` to base           |
| `src/components/onboarding/VendorOnboarding.tsx:83-99,122-130` — bespoke `rounded-md bg-ink py-3` CTAs (don't use Button)                                                                                                                                                  | Add `transition-transform active:scale-[0.96]` inline            |
| `src/components/onboarding/CoupleOnboarding.tsx:76-92,159-166,194-201` — bespoke "Yes"/"Just browsing"/"Continue"/"Start exploring"                                                                                                                                        | Same                                                             |
| `src/components/booking/CustomRequestForm.tsx:111-122,265-271` — success anchors + Submit                                                                                                                                                                                  | Same                                                             |
| `src/components/auth/signup-form.tsx:149-178` — role-picker tiles                                                                                                                                                                                                          | `transition-transform active:scale-[0.96]` for tactile selection |

#### Optical alignment

| Before                                                                                                                                                                             | After                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/onboarding/VendorOnboarding.tsx:89,129,CoupleOnboarding.tsx:165,200` — "Continue →"/"Set up your profile →"/"Start exploring →" text-arrow on flex-centered button | Replace text-arrow with `<span className="inline-flex items-center gap-1.5">Continue<ArrowRight className="size-4" /></span>` + `pl-0.5` (or icon offset `translate-x-[0.5px]`) |
| `src/components/auth/ForgotPasswordForm.tsx:81` — "← Back to sign in" arrow off-center                                                                                             | Wrap arrow `<span className="inline-block -translate-x-0.5">←</span>`                                                                                                           |

#### Minimum hit area

| Before                                                                                                               | After                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/components/onboarding/StepBasics.tsx:168-175` — dismiss `<X size-3>` no padding ~12×12                          | `relative inline-flex h-10 w-10 items-center justify-center` or `::before` extension |
| `src/components/onboarding/BioAssistCard.tsx:148-156` — dismiss `<X size-4>` no padding                              | Pad button to 40×40                                                                  |
| `src/components/forms/PackageAddonsEditor.tsx:74-83` — `Button size="sm"` "×" remove (~36px)                         | `size="default"` or `before:absolute before:inset-[-6px]` extension                  |
| `src/components/forms/EventRow.tsx:93-101` — "Remove" text-only                                                      | `px-2 py-1` minimum + `::before` extension to 40×40                                  |
| `src/components/booking/CustomRequestForm.tsx:217-226,230-237` — "Remove this event"/"+ Add another event" text-only | Padding to clear 40×40                                                               |
| `src/components/onboarding/StepReview.tsx:95-97,121-126,150-152,187-192` — "Edit" links ~28px                        | `inline-flex h-10 items-center px-2`                                                 |

### Marketplace + search

#### Shadows over borders

| Before                                                                                                                                                                | After                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/filters/AllFiltersSheet.tsx:70` — `border-l border-hairline shadow-[-12px_0_28px_rgba(27,20,20,0.10)]` stacks hairline on existing shadow | Drop `border-l border-hairline`; layered shadow alone reads cleanly                                        |
| `src/components/marketplace/filters/AllFiltersSheet.tsx:80,108` — header/footer `border-b/-t border-hairline`                                                         | `shadow-[0_1px_0_rgba(27,20,20,0.06),0_8px_12px_-12px_rgba(27,20,20,0.08)]` for header, inverse for footer |
| `src/components/marketplace/search/MobileSearchSheet.tsx:140` — `border-t border-hairline` footer                                                                     | `shadow-[0_-1px_0_rgba(27,20,20,0.06),0_-8px_12px_-12px_rgba(27,20,20,0.08)]`                              |
| `src/components/marketplace/vendor-profile/VendorProfile.tsx:149,190` — section dividers `border-t border-ink/10 pt-8`                                                | `shadow-[0_-1px_0_rgba(0,0,0,0.06)]` + keep `pt-8`                                                         |
| `src/components/marketplace/OwnerBanner.tsx:12` — sticky `border-b border-ink/15`                                                                                     | Drop border, `shadow-[0_1px_0_rgba(0,0,0,0.05),0_6px_10px_-10px_rgba(0,0,0,0.10)]`                         |

#### Image outlines

| Before                                                                                                                                 | After                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/components/marketplace/UnclaimedVendorProfile.tsx:38-45` — hero `<img>` no outline; `bg-muted` shows through translucent corners  | Add `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10` |
| `src/components/marketplace/CategoryHoverExpand.tsx:74-81` — `<Image>` inside `rounded-lg` tile flush against cream gutter when active | Add `outline outline-1 -outline-offset-1 outline-black/10`                       |
| `src/components/marketplace/CategoryHoverExpandMobile.tsx:44-50` — grid `<Image>` no outline                                           | Same outline-black/10                                                            |

#### Hit area

| Before                                                                                                       | After                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/components/marketplace/filters/AllFiltersSheet.tsx:84-91` — close `size-8` (32×32) + `X size-4`         | `size-10` (40×40) or `before:absolute before:inset-[-4px]`                    |
| `src/components/marketplace/filters/Chip.tsx:104-118` — applied-variant remove `size-4` (16×16) + `X size-3` | Visible 16px, extend hit area `relative before:absolute before:inset-[-12px]` |

#### Tabular numbers

| Before                                                                                                                       | After                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `src/components/marketplace/filters/AllFiltersSheet.tsx:125-130` — `Show {fmtCount(count)} vendors` count updates per filter | Add `tabular-nums` to Button text span |
| `src/components/marketplace/vendor-profile/VendorProfile.tsx:194` — `vendor.average_rating!.toFixed(1)` `text-2xl font-bold` | Add `tabular-nums`                     |
| `src/components/marketplace/vendor-profile/VendorProfile.tsx:206` — `({vendor.review_count} reviews)`                        | Add `tabular-nums`                     |
| `src/components/marketplace/filters/Chip.tsx:93-101,129-138` — count badge digits                                            | Add `tabular-nums`                     |

#### Text wrapping

| Before                                                                                                                       | After              |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/components/marketplace/UnclaimedVendorProfile.tsx:54` — h1 vendor name                                                  | Add `text-balance` |
| `src/components/marketplace/UnclaimedVendorProfile.tsx:61` — bio `<p>`                                                       | Add `text-pretty`  |
| `src/components/marketplace/HomepageHero.tsx:36-40` — subhead with haldi-highlighted "Cultural"                              | Add `text-pretty`  |
| `src/components/marketplace/vendor-profile/VendorProfile.tsx:116,153` — "Compare side-by-side. All prices include…" subheads | Add `text-pretty`  |

#### Subtle exit

| Before                                                                                                              | After                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/marketplace/SearchBar.tsx:266-269` — Panel `animate-in fade-in-0 duration-200` then instant unmount | `AnimatePresence` with `animate={{opacity: 1, y: 0}}`/`exit={{opacity: 0, y: -8}}` ~100ms or `data-[state=closed]:animate-out fade-out-0 duration-100` |
| `src/components/marketplace/filters/FilterChipRow.tsx:202-207` — AnchoredPanel same                                 | Same fix; exit ~100ms with 4-8px translate                                                                                                             |
| `src/components/marketplace/HomepageWordmarkPanel.tsx:71-83` — symmetric `duration-[600ms]` both ways               | `duration-[400ms]` on outgoing, 600ms on incoming for asymmetric crossfade                                                                             |

#### Stagger enter

| Before                                                                                                                               | After                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/components/marketplace/HomepageHero.tsx:20-64` — hero renders as static block                                                   | Wrap each chunk in motion.divs `initial={{opacity: 0, y: 8}}/animate={{opacity: 1, y: 0}}` delays 0, 0.1, 0.2, 0.3, 0.4 |
| `src/components/marketplace/CategoryHoverExpand.tsx:106-158` — active-state overlay fades as one block `delay-100`                   | Split kicker/h3/counter/Browse-pill into separate motion children `delay-[100ms]` → `delay-[400ms]`                     |
| `src/components/marketplace/HomepageWordmarkPanel.tsx:55-100` — "MADE IN CHICAGO" kicker + wordmark + glyph row mount simultaneously | Staggered enter (kicker → wordmark → glyph row); `prefersReducedMotion` short-circuits                                  |

#### Scale on press

| Before                                                                                                                   | After                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/components/marketplace/SearchBar.tsx:213-228` — submit orb hover-translate but no press                             | `active:scale-[0.96]` + append `,scale` to transition-[background-color,box-shadow,transform] |
| `src/components/marketplace/ExitPreviewPill.tsx:8-16` — floating CTA flat                                                | `active:scale-[0.96] transition-transform`                                                    |
| `src/components/marketplace/OwnerBanner.tsx:18-30` — View as Customer + Edit Profile                                     | `active:scale-[0.96]` to both                                                                 |
| `src/components/marketplace/UnclaimedVendorProfile.tsx:75-82,90-96` — Show on Instagram + I own this business            | `active:scale-[0.96] transition-transform`                                                    |
| `src/components/marketplace/OwnThisBusinessModal.tsx:80-86,119-132,182-196,257-271` — Close/Continue/Send/Cancel/Request | `active:scale-[0.96] transition-transform` to ink primary buttons                             |
| `src/components/marketplace/filters/Chip.tsx:46-66` — chip toggles hover-pink-border no press                            | `active:scale-[0.96]` + `scale` in transition list (skip `applied` variant)                   |

#### Optical alignment

| Before                                                                                                                       | After                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/components/marketplace/filters/Chip.tsx:46-66,140-150` — dropdown chevron right inside `px-3.5`                         | Trim right: `pr-3` (or `pr-2.5`)                     |
| `src/components/marketplace/filters/Chip.tsx:62-64,125-127` — all-filters chip Sliders left + label right symmetric `px-3.5` | `pl-3 pr-3.5` so icon optically centered             |
| `src/components/marketplace/SearchBar.tsx:213-228` — lens icon centered in circle                                            | `pr-px` or `translate-x-[0.5px]` on inner `<Search>` |

### Dashboard + animation

#### Concentric border radius

| Before                                                                                                                                                                             | After                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/notifications/NotificationDropdown.tsx:45` — shell `rounded-lg overflow-hidden`, first/last `<li>` no `rounded-*`, inner focus ring `rounded-md` mismatched corner | Round first/last items `first:rounded-t-md last:rounded-b-md` and drop inner `rounded-md` on stretched primary, or `rounded-none` |
| `src/components/dashboard/DepositDialog.tsx:69,85` — DialogContent `sm:rounded-lg p-6`; two stacked inner panels both `rounded-md` (no hierarchy)                                  | Deposit-summary box `rounded-lg` (matches dialog), policy card `rounded-md`                                                       |
| `src/components/dashboard/CancelDialog.tsx:165,177` — warning box + Input both `rounded-md` (siblings + inner same)                                                                | Warning card → `rounded-lg`, Input stays `rounded-md`                                                                             |

#### Optical over geometric alignment

| Before                                                                                                                                               | After                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/components/dashboard/BusinessSwitcher.tsx:73` — `<ChevronDown h-4 w-4>` flush vs truncated name with `gap-2`; chevron mass low                  | `<span className="-mb-px">` wrap (or `relative top-px` on icon) so chevron aligns x-height |
| `src/components/notifications/NotificationBell.tsx:104` — badge `-right-1 -top-1` + `h-5 min-w-[1.25rem]` + `text-[10px]`; single-digit left-shifted | `text-center leading-none px-1.5`, bump `-right-1.5`                                       |
| `src/components/notifications/NotificationsPageClient.tsx:160-163` — ChevronRight/Down swap; right-chevron right-weighted                            | `mr-0.5` to right-chevron variant (or render in fixed `w-4` with `pl-0.5`)                 |

#### Shadows over borders

| Before                                                                                                  | After                                                                              |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/components/dashboard/SidebarNav.tsx:26` — active uses only `bg-accent`; depth-less                 | Add `shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.06),0_1px_2px_rgb(var(--ink)/0.04)]` |
| `src/components/dashboard/BackfillBanner.tsx:33` — `border border-hairline bg-cream-soft`               | `shadow-[0_1px_0_rgb(var(--ink)/0.04),0_4px_12px_-4px_rgb(var(--ink)/0.06)]`       |
| `src/components/dashboard/CustomerWelcomeBanner.tsx:31` — `border border-ink/10 bg-cream`               | Layered transparent shadow over cream                                              |
| `src/components/dashboard/CalendarHoldsList.tsx:85` — each `<li>` `rounded-md border`                   | `shadow-[0_1px_0_rgb(var(--ink)/0.06)]` per row (or `divide-y` on `<ul>`)          |
| `src/components/dashboard/BlockDateForm.tsx:47,CapacityField.tsx:33` — `rounded-md border p-4`          | `shadow-sm` on borderless cream card                                               |
| `src/components/booking/VendorBookingActions.tsx:108` — `<Card border-primary/20>` indigo-tinted border | Drop tint, `shadow-md` for elevation                                               |

#### Split and stagger enter animations

| Before                                                                                           | After                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/dashboard/PanelShell.tsx:57-73` — `<aside>` mounts at once, no transform/opacity | `motion.aside initial={{x: 24, opacity: 0}} animate={{x: 0, opacity: 1}} transition={{type: 'spring', duration: 0.3, bounce: 0}}` + stagger header/title/children by 80/160ms |
| `src/components/notifications/NotificationDropdown.tsx:43-89` — dropdown pops in instantly       | `motion.div initial={{y: -4, opacity: 0}} animate={{y: 0, opacity: 1}} transition={{type: 'spring', duration: 0.22, bounce: 0}}` + stagger header/list/footer 60ms each       |
| `src/components/celebration/FirstBookingCelebration.tsx:33-66` — dialog content one block        | Split h2/subtitle/3-step/CTA into 4 motion children delayed 100ms each                                                                                                        |
| `src/components/dashboard/CustomerWelcomeBanner.tsx:29-68` — banner renders as one chunk         | Headline + chip row separate motion children delay 0 / 100ms                                                                                                                  |

#### Subtle exit animations

| Before                                                                                                     | After                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/dashboard/PanelShell.tsx:46-76` — closes via hard unmount                                  | After enter spring added, `AnimatePresence initial={false}` at layout slot + `exit={{x: 12, opacity: 0}}` half-duration (150ms) |
| `src/components/notifications/NotificationDropdown.tsx:42-89` — instant unmount via `open && <Dropdown />` | `AnimatePresence initial={false}` with `exit={{y: -2, opacity: 0}}` 120ms (softer than 220ms enter)                             |
| `src/components/dashboard/CustomerWelcomeBanner.tsx:27` — `if (dismissed) return null` snaps out           | Animate `opacity: 0 + translateY: -8px` 180ms before unmount                                                                    |

#### Contextual icon animations

| Before                                                                                                                                           | After                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/layout/footer/NewsletterForm.tsx:108-115` — `{submitting ? <Loader2 /> : success ? <Check /> : <ArrowRight />}` conditional swap | Stack all three; `AnimatePresence initial={false} mode="popLayout"` + `motion.span` each: `initial={{scale: 0.25, opacity: 0, filter: 'blur(4px)'}} animate={{scale: 1, opacity: 1, filter: 'blur(0)'}}` spring bounce 0 |
| `src/components/notifications/NotificationsPageClient.tsx:160-163` — `{collapsed ? <ChevronRight /> : <ChevronDown />}` swap                     | Render one chevron, rotate via `motion.span animate={{rotate: collapsed ? 0 : 90}}` spring                                                                                                                               |
| `src/components/notifications/NotificationBell.tsx:103-111` — badge appears/disappears no animation                                              | `AnimatePresence initial={false}`, enter `scale: 0.25→1, opacity: 0→1, blur 4px→0` spring; exit `scale: 0.8, opacity: 0` half-duration                                                                                   |
| `src/components/notifications/NotificationCard.tsx:116-123` — unread blue dot snaps to gone on `read_at` flip                                    | `AnimatePresence`, exit `scale: 0.2, opacity: 0` spring                                                                                                                                                                  |

#### Tabular numbers

| Before                                                                                                                                                | After                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `src/components/dashboard/CapacityField.tsx:48` — `<Input type="number">` shifts width 1→50                                                           | Add `tabular-nums` to input           |
| `src/components/dashboard/VendorNotesEditor.tsx:82` — `{notes.length} / {MAX}` next to "Saving…"                                                      | Wrap counter span `tabular-nums`      |
| `src/components/dashboard/DisputeDialog.tsx:85` — `{reason.length} / 2000`                                                                            | Add `tabular-nums` to `<p>`           |
| `src/components/bookings/CounterModal.tsx:121` — `{note.length}/200`                                                                                  | Add `tabular-nums`                    |
| `src/components/notifications/NotificationsPageClient.tsx:158` — group header `({items.length})`                                                      | Add `tabular-nums`                    |
| `src/components/notifications/NotificationCard.tsx:58` — `{timeAgo(...)}` ("2m","12m","3h")                                                           | Add `tabular-nums`                    |
| `src/components/dashboard/BookingActions.tsx:143,149,176` + `VendorBookingActions.tsx:140-144,171-174` — `{countersLeft}` / `{adjustsLeft}` remaining | Add `tabular-nums` to helper `<span>` |

#### Text wrapping

| Before                                                                                                                                 | After                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/components/dashboard/CustomerWelcomeBanner.tsx:39` — `Your event is on … — that's N days away.` `text-lg font-semibold`           | Add `text-balance`                                                      |
| `src/components/dashboard/BackfillBanner.tsx:42-46` — title `Complete your profile` + body                                             | `text-balance` title, `text-pretty` body                                |
| `src/components/celebration/FirstBookingCelebration.tsx:36` — `<h2 className="text-2xl font-bold">`                                    | Add `text-balance`                                                      |
| `src/components/notifications/NotificationCard.tsx:48,56` — title + body both `truncate` (silently drops content on notification page) | In `showAllActions` branch, swap `truncate` → `text-pretty break-words` |
| `src/components/dashboard/CancelDialog.tsx:166-169,DepositDialog.tsx:80-83,87-90` — multi-sentence policy paragraphs                   | Add `text-pretty`                                                       |
| `src/components/dashboard/PauseProfileToggle.tsx:75,PackageActiveToggle.tsx:72,CapacityField.tsx:35` — body `<p>` helper copy          | Add `text-pretty`                                                       |

#### Scale on press

| Before                                                                                                                | After                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/components/dashboard/CancelDialog.tsx:194-201` — destructive Cancel Booking confirm                              | `active:scale-[0.96] transition-transform` (or Button base cascade)    |
| `src/components/dashboard/DepositDialog.tsx:125-127` — Pay $X                                                         | Same                                                                   |
| `src/components/dashboard/DisputeDialog.tsx:92-94` — File Dispute                                                     | Same                                                                   |
| `src/components/dashboard/ReviewForm.tsx:224-226` — Submit Review                                                     | Same                                                                   |
| `src/components/bookings/CounterModal.tsx:147-149` — Send counter-offer                                               | Same                                                                   |
| `src/components/booking/VendorAdjustQuoteForm.tsx:153-155` — Send Adjusted Quote                                      | Same                                                                   |
| `src/components/booking/VendorBookingActions.tsx:122-130,150,156,164` — Accept / Send quote / Send revised quote      | Same                                                                   |
| `src/components/booking/AdjustmentReview.tsx:141-146,151` — Accept / Decline / Counter                                | Same                                                                   |
| `src/components/dashboard/BookingActions.tsx:130-172` — Pay Deposit / Counter / Mark Complete / Leave Review / Cancel | Same                                                                   |
| `src/components/dashboard/BlockDateForm.tsx:92-94,CapacityField.tsx:56-58` — submits                                  | Same                                                                   |
| `src/components/dashboard/CalendarHoldsList.tsx:98-100` — Unblock                                                     | `active:scale-[0.96] transition-transform`                             |
| `src/components/notifications/NotificationCard.tsx:67-72,95-112` — `<li>` + action chips (most-tapped surface)        | `active:scale-[0.98]` on `<li>`, `active:scale-[0.96]` on action chips |
| `src/components/notifications/NotificationDropdown.tsx:52-58,81-87` — Mark All Read + See all →                       | `active:scale-[0.96] transition-transform`                             |
| `src/components/notifications/NotificationsPageClient.tsx:107-122` — tab pills                                        | `active:scale-[0.96] transition-transform`                             |
| `src/components/dashboard/SidebarNav.tsx:24-27` — every nav row `transition-colors` only                              | `active:scale-[0.98] transition-[transform,background-color]`          |
| `src/components/dashboard/BusinessSwitcher.tsx:61-74` — pill trigger                                                  | `active:scale-[0.96] transition-transform`                             |
| `src/components/celebration/FirstBookingCelebration.tsx:58-64` — Got it → hover-translate no active scale             | Add `active:scale-[0.96]` to existing transition                       |

#### Never `transition: all`

| Before                                                                                                                    | After                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/components/celebration/FirstBookingCelebration.tsx:61` — Got it → bare `transition` (= all)                          | `transition-[transform,background-color,box-shadow] duration-200`   |
| `src/components/layout/footer/WordmarkCycle.tsx:102` — `transition-opacity` Tailwind + inline `transition` style override | Drop Tailwind class; specify inline `transitionProperty: 'opacity'` |

#### Minimum hit area

| Before                                                                                                                   | After                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/components/dashboard/PanelShell.tsx:64-71` — close `rounded p-1` + `h-4 w-4` ≈ 24×24 (most-used affordance)         | `size-9` or `size-10` + `flex items-center justify-center`    |
| `src/components/notifications/NotificationBell.tsx:96-101` — `p-2` + `h-5 w-5` Bell = 36×36                              | `p-2.5` (40px) or `inline-flex h-10 w-10`                     |
| `src/components/dashboard/CustomerWelcomeBanner.tsx:59-66` — dismiss `<X size={18}>` no min size                         | `inline-flex size-10 items-center justify-center`             |
| `src/components/dashboard/BackfillBanner.tsx:55-62` — dismiss `<X>` `size-9` (36×36)                                     | `size-10`                                                     |
| `src/components/notifications/NotificationDropdown.tsx:52-58,81-87` — text-only links                                    | `min-h-10` + `px-3 py-2.5`                                    |
| `src/components/notifications/NotificationsPageClient.tsx:125-131` — Mark all read text-only no padding ≈ 20×16          | `min-h-10 inline-flex items-center px-2` or `<button py-2.5>` |
| `src/components/notifications/NotificationCard.tsx:95-112` — inline action chips `px-3 py-1.5 text-sm` ~32px             | `min-h-10 px-3 py-2`                                          |
| `src/components/booking/AdjustmentReview.tsx:151` + `BookingActions.tsx:140` — Counter buttons Button default `h-9` (36) | Force `h-10` or `min-h-10`                                    |

#### `will-change` sparingly

| Before                                                                                                                               | After                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/components/celebration/HeartConfetti.tsx:55-69` — 12 spans run 1s `@keyframes` animating transform+opacity; no `will-change`    | `willChange: 'transform, opacity'` inline (only these two); drop via `onAnimationEnd`  |
| `src/components/layout/footer/WordmarkCycle.tsx:99-113` — large `clamp(60px,16vw,200px)` glyph crossfade 3.5s loop, no `will-change` | `style={{willChange: 'opacity'}}` on inner span only (wrapper `<h2>` doesn't carry it) |

---

## Caveats

- Some files referenced in the audit live ONLY on calendar-feed (Navbar, ExternalCalendarSyncCard, Silk, SpotlightCard etc.) — applied where they exist.
- The audit branch (`fix/web-guidelines-systemic-patterns`) was reviewed — findings represent state AFTER the a11y cleanup. Polish work should layer on top, not duplicate.
- All findings include `file:line` for VS Code/Cursor jump.
- Total subagent tokens: ~370k across 5 chunks.
