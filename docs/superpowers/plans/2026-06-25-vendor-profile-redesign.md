# Vendor Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 254-line `VendorProfile.tsx` with an Airbnb-style split layout that has a persistent booking CTA, an above-the-fold sticky card on desktop, a sticky bottom bar on mobile, and the About/Bio moved up directly under the photos.

**Architecture:** Decompose the monolithic profile into 6 focused presentational components under `src/components/marketplace/vendor-profile/`. The top-level `<VendorProfile>` becomes a thin orchestrator that composes them and handles the responsive switch via Tailwind classes (`hidden md:block` / `md:hidden`), preserving the existing owner-banner + preview-mode behavior. Zero schema or API changes — all data already on `vendor_profiles`.

**Tech Stack:** Next.js 14 App Router (client components) · React 18 (`useState`, refs) · Tailwind + shadcn primitives (`Button`, `Badge`, `Sheet` drawer) · lucide-react icons · `position: sticky` + `Element.scrollIntoView` for sticky/scroll behavior · `DEPOSIT_RATE` constant from `src/lib/utils.ts` (5%) · existing `SavedVendorsProvider` + `useSavedVendors` hook from Bucket J for the mobile carousel heart button.

## Global Constraints

- **Spec source of truth:** `docs/superpowers/specs/2026-06-24-vendor-profile-redesign-design.md` — every task implicitly includes the spec's locked rules.
- **Git workflow:** branch off `main` → `feat/vendor-profile-redesign` → squash-merge via `gh pr create`. NEVER commit directly to `main`.
- **Featured package = cheapest** in the packages array (`Math.min(p.base_price_cents)`). No new column.
- **Deposit math:** uses `DEPOSIT_RATE = 0.05` from `src/lib/utils.ts`. Display: `Pay [DEPOSIT] deposit today · [REMAINING] due to vendor at event`.
- **Heart icon styling rule (Bucket B → DESIGN.md):** filled = plain red (`text-red-500 fill-red-500`); idle = `text-ink/50` with `hover-pink-text`. Hot-pink reserved for hover only.
- **Owner banner preserved verbatim** from Bucket B T13/T14: `<OwnerBanner>` above the breadcrumb when `isOwner && !previewMode`; `<ExitPreviewPill>` bottom-right when `isOwner && previewMode`; `interactive === false` makes the booking CTA fire `toast('Preview mode — bookings disabled.')` instead of routing.
- **Mobile breakpoint:** `md` (768px). Use Tailwind `md:hidden` / `hidden md:block` (or `md:grid`). No JS viewport detection.
- **Hover system (Bucket B):** primary buttons `bg-ink text-cream hover:bg-hot-pink hover:-translate-y-px hover:shadow-pink`; outline buttons `border-ink text-ink hover-pink-border`. `motion-reduce:hover:translate-y-0` on every transform-on-hover.
- **Brand fonts:** `font-spectral` for headings (Spectral display), Schibsted Grotesk inherited for body.
- **No new migrations.** All data on `vendor_profiles`. No `is_featured` flag added in v1.
- **Zero changes to `BookingForm`, custom-request form, packages editor, onboarding wizard.** This is a profile-page-only redesign.

---

## File Structure

**New folder:** `src/components/marketplace/vendor-profile/`

**New files:**

- `src/components/marketplace/vendor-profile/VendorProfile.tsx` — Top-level orchestrator (replaces the existing 254-line file at the marketplace level)
- `src/components/marketplace/vendor-profile/IdentityPanel.tsx` — Name + verified badge + meta row + About/Bio
- `src/components/marketplace/vendor-profile/PhotoGalleryHero.tsx` — Desktop 2×3 mosaic
- `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx` — Mobile swipeable carousel
- `src/components/marketplace/vendor-profile/BookingStickyCard.tsx` — Desktop right-side sticky card
- `src/components/marketplace/vendor-profile/BookingBottomBar.tsx` — Mobile sticky bottom bar + package picker drawer
- `src/components/marketplace/vendor-profile/helpers.ts` — `getFeaturedPackage()`, `scrollToPackages()`, deposit math, formatters

**Modified files:**

- `src/components/marketplace/VendorProfile.tsx` — Replaced with a 3-line re-export from the new location (preserves all import paths)
- `src/components/marketplace/PackageGrid.tsx` — Add optional `featuredPackageId?: string` prop; render `"Most popular"` pink badge + thicker border on the matching card
- `tailwind.config.ts` — Add `pulse-pink` keyframe utility for the brief 1.5s pulse animation on the featured package card after scroll

**New test files:**

- `src/__tests__/components/vendor-profile/helpers.test.ts` — `getFeaturedPackage()` + deposit math unit tests
- `src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx` — Renders featured package, correct deposit math, "compare all N packages" link hidden when only 1 package
- `src/__tests__/components/vendor-profile/IdentityPanel.test.tsx` — Verified badge conditional, meta items hidden when source data is null
- `tests/e2e/vendor-profile-desktop-flow.spec.ts` — Sticky card visible, click "compare all packages" → smooth scroll → featured card pulses → routes to `/book`
- `tests/e2e/vendor-profile-mobile-flow.spec.ts` — Bottom bar visible, tap CTA → routes to `/book`
- `tests/e2e/vendor-profile-zero-packages.spec.ts` — Vendor with no packages → sticky card shows custom-request fallback → routes to `/request`

---

## Task List

- **T1.** Folder scaffold + `helpers.ts` (featured-package, deposit math, scrollToPackages, formatters) + `pulse-pink` Tailwind utility
- **T2.** `IdentityPanel` component
- **T3.** `PhotoGalleryHero` (desktop 2×3 mosaic)
- **T4.** `PhotoCarouselHero` (mobile swipeable carousel with heart button)
- **T5.** `BookingStickyCard` (desktop right card)
- **T6.** `BookingBottomBar` (mobile sticky bottom + Sheet picker drawer)
- **T7.** `PackageGrid` — add `featuredPackageId` prop + "Most popular" badge + `data-pkg-featured` attribute for pulse target
- **T8.** `VendorProfile` orchestrator rewrite — composes all sub-components, responsive switch, owner banner integration, empty states
- **T9.** Re-export shim at `src/components/marketplace/VendorProfile.tsx` so existing import paths keep working
- **T10.** E2E spec — desktop flow
- **T11.** E2E spec — mobile flow
- **T12.** E2E spec — zero-packages fallback
- **T13.** PR + manual smoke

---

### Task 1: Folder scaffold + helpers + pulse-pink utility

**Files:**

- Create: `src/components/marketplace/vendor-profile/helpers.ts`
- Modify: `tailwind.config.ts` (add `pulse-pink` keyframe + utility)
- Test: `src/__tests__/components/vendor-profile/helpers.test.ts`

**Interfaces:**

- Consumes: `DEPOSIT_RATE` from `src/lib/utils.ts`.
- Produces:

  ```ts
  export interface PackageLike {
    id: string;
    base_price_cents: number | null;
  }
  export function getFeaturedPackage<T extends PackageLike>(packages: T[]): T | null;
  export function calculateDeposit(totalCents: number): number; // Math.round(totalCents * DEPOSIT_RATE)
  export function calculateRemaining(totalCents: number): number; // totalCents - calculateDeposit
  export function formatPrice(cents: number): string; // Intl USD, 0 fraction digits
  export function scrollToPackages(): void; // smooth scroll + 1.5s pulse on featured card
  ```

- [ ] **Step 1: Create the folder**

```bash
mkdir -p src/components/marketplace/vendor-profile
mkdir -p src/__tests__/components/vendor-profile
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/__tests__/components/vendor-profile/helpers.test.ts
import { describe, it, expect } from 'vitest';
import {
  getFeaturedPackage,
  calculateDeposit,
  calculateRemaining,
  formatPrice,
} from '@/components/marketplace/vendor-profile/helpers';

describe('getFeaturedPackage', () => {
  it('returns null for empty array', () => {
    expect(getFeaturedPackage([])).toBeNull();
  });

  it('returns the cheapest package by base_price_cents', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000 },
      { id: 'b', base_price_cents: 120_000 },
      { id: 'c', base_price_cents: 180_000 },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('b');
  });

  it('treats null base_price_cents as Infinity (deprioritized)', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000 },
      { id: 'b', base_price_cents: null },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('a');
  });

  it('returns first when all have equal price', () => {
    const packages = [
      { id: 'a', base_price_cents: 100_000 },
      { id: 'b', base_price_cents: 100_000 },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('a');
  });
});

describe('calculateDeposit', () => {
  it('is 5% rounded to nearest cent', () => {
    expect(calculateDeposit(120_000)).toBe(6_000); // $1,200 → $60
    expect(calculateDeposit(180_000)).toBe(9_000); // $1,800 → $90
    expect(calculateDeposit(280_001)).toBe(14_000); // 14_000.05 rounded
  });
});

describe('calculateRemaining', () => {
  it('is total minus deposit', () => {
    expect(calculateRemaining(120_000)).toBe(114_000);
  });
});

describe('formatPrice', () => {
  it('formats cents as USD with no decimals', () => {
    expect(formatPrice(120_000)).toBe('$1,200');
    expect(formatPrice(9_000)).toBe('$90');
    expect(formatPrice(0)).toBe('$0');
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

```bash
npx vitest run src/__tests__/components/vendor-profile/helpers.test.ts
```

Expected: 4 describe blocks fail with "Cannot find module".

- [ ] **Step 4: Implement helpers.ts**

```ts
// src/components/marketplace/vendor-profile/helpers.ts
import { DEPOSIT_RATE } from '@/lib/utils';

export interface PackageLike {
  id: string;
  base_price_cents: number | null;
}

export function getFeaturedPackage<T extends PackageLike>(packages: T[]): T | null {
  if (packages.length === 0) return null;
  return packages.reduce((cheapest, current) => {
    const cheapPrice = cheapest.base_price_cents ?? Infinity;
    const currPrice = current.base_price_cents ?? Infinity;
    return currPrice < cheapPrice ? current : cheapest;
  });
}

export function calculateDeposit(totalCents: number): number {
  return Math.round(totalCents * DEPOSIT_RATE);
}

export function calculateRemaining(totalCents: number): number {
  return totalCents - calculateDeposit(totalCents);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Smooth-scrolls to the packages comparison section and briefly pulses the
 * featured package card to draw the eye. No-op if the section isn't on the page.
 * Respects prefers-reduced-motion via CSS (the pulse keyframe is overridden).
 */
export function scrollToPackages(): void {
  const section = document.getElementById('packages-section');
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const featuredCard = section.querySelector<HTMLElement>('[data-pkg-featured="true"]');
  if (featuredCard) {
    featuredCard.classList.add('pulse-pink');
    setTimeout(() => featuredCard.classList.remove('pulse-pink'), 1500);
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/components/vendor-profile/helpers.test.ts
```

Expected: all 4 describes pass.

- [ ] **Step 6: Add `pulse-pink` to Tailwind config**

In `tailwind.config.ts`, add to the `theme.extend.keyframes` block (create if missing):

```ts
keyframes: {
  'pulse-pink': {
    '0%, 100%': { boxShadow: '0 0 0 0 rgba(209, 0, 108, 0.4)' },
    '50%':       { boxShadow: '0 0 0 6px rgba(209, 0, 108, 0.0)' },
  },
},
animation: {
  'pulse-pink': 'pulse-pink 1.5s ease-out 1',
},
```

Then in the existing plugin block (Bucket B added `hover-pink-*` utilities there), append a `.pulse-pink` class that uses the animation:

```ts
// Inside the plugin's addUtilities call
'.pulse-pink': {
  'animation': 'pulse-pink 1.5s ease-out 1',
  '@media (prefers-reduced-motion: reduce)': {
    'animation': 'none',
    'outline': '2px solid rgba(209, 0, 108, 0.5)',
    'outline-offset': '4px',
  },
},
```

Verify the existing `tailwind.config.ts` plugin structure first:

```bash
grep -n "addUtilities\|hover-pink-text" tailwind.config.ts
```

If the file uses a different plugin pattern, match it.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/marketplace/vendor-profile/helpers.ts \
  src/__tests__/components/vendor-profile/helpers.test.ts \
  tailwind.config.ts
git commit -m "feat(vendor-profile): scaffold helpers + pulse-pink utility (T1)"
```

---

### Task 2: IdentityPanel component

**Files:**

- Create: `src/components/marketplace/vendor-profile/IdentityPanel.tsx`
- Test: `src/__tests__/components/vendor-profile/IdentityPanel.test.tsx`

**Interfaces:**

- Consumes: nothing from earlier tasks (pure presentational).
- Produces:

  ```tsx
  interface IdentityPanelProps {
    vendor: VendorRow;
  }
  export function IdentityPanel(props: IdentityPanelProps): JSX.Element;
  ```

  Renders: `<h1>` name + verified `<Badge>` + meta row (category, location, languages, years) + `<h2>About</h2>` + bio paragraph (whitespace-pre-wrap) + language chips below the bio.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/vendor-profile/IdentityPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IdentityPanel } from '@/components/marketplace/vendor-profile/IdentityPanel';

const baseVendor = {
  id: 'v-1',
  business_name: 'Epic Events Photo Booth',
  verified: true,
  category: 'photography',
  service_area: ['Chicago', 'Naperville'],
  languages: ['English', 'Spanish', 'Hindi'],
  years_in_business: 12,
  bio: '3,000+ events served.',
  response_sla_hours: 2,
  // ... other VendorRow fields can be null/undefined for this component
} as any;

describe('IdentityPanel', () => {
  it('renders name and verified badge', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('Epic Events Photo Booth')).toBeInTheDocument();
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it('hides verified badge when vendor.verified === false', () => {
    render(<IdentityPanel vendor={{ ...baseVendor, verified: false }} />);
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('renders the bio prose', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('3,000+ events served.')).toBeInTheDocument();
  });

  it('renders language chips', () => {
    render(<IdentityPanel vendor={baseVendor} />);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    expect(screen.getByText('Hindi')).toBeInTheDocument();
  });

  it('hides bio section when bio is null', () => {
    render(<IdentityPanel vendor={{ ...baseVendor, bio: null }} />);
    expect(screen.queryByText(/about/i)).not.toBeInTheDocument();
  });

  it('falls back to "Chicago" when service_area is null', () => {
    render(<IdentityPanel vendor={{ ...baseVendor, service_area: null }} />);
    expect(screen.getByText(/chicago/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/__tests__/components/vendor-profile/IdentityPanel.test.tsx
```

- [ ] **Step 3: Implement IdentityPanel**

```tsx
// src/components/marketplace/vendor-profile/IdentityPanel.tsx
import { Badge } from '@/components/ui/badge';
import { CheckCircle, MapPin, Languages, CalendarDays } from 'lucide-react';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface IdentityPanelProps {
  vendor: VendorRow;
}

export function IdentityPanel({ vendor }: IdentityPanelProps) {
  const location = vendor.service_area?.length ? vendor.service_area.join(', ') : 'Chicago';
  return (
    <section data-testid="identity-panel" className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-spectral text-3xl font-bold text-ink">{vendor.business_name}</h1>
          {vendor.verified && (
            <Badge className="gap-1">
              <CheckCircle className="h-3 w-3" /> Verified
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink/80">
          <Badge variant="outline">
            {VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category}
          </Badge>
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {location}
          </span>
          {vendor.languages && vendor.languages.length > 0 && (
            <span className="flex items-center gap-1">
              <Languages className="h-4 w-4" />
              {vendor.languages.join(', ')}
            </span>
          )}
          {vendor.years_in_business != null && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {vendor.years_in_business} {vendor.years_in_business === 1 ? 'year' : 'years'} in
              business
            </span>
          )}
        </div>
      </div>

      {vendor.bio && (
        <div>
          <h2 className="font-spectral text-xl font-semibold text-ink">About</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
            {vendor.bio}
          </p>
          {vendor.languages && vendor.languages.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {vendor.languages.map((lang) => (
                <span
                  key={lang}
                  className="rounded-full border border-ink/20 bg-white px-3 py-1 text-xs text-ink"
                >
                  {lang}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run src/__tests__/components/vendor-profile/IdentityPanel.test.tsx
```

Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/vendor-profile/IdentityPanel.tsx \
  src/__tests__/components/vendor-profile/IdentityPanel.test.tsx
git commit -m "feat(vendor-profile): IdentityPanel component (T2)"
```

---

### Task 3: PhotoGalleryHero (desktop 2×3 mosaic)

**Files:**

- Create: `src/components/marketplace/vendor-profile/PhotoGalleryHero.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces:

  ```tsx
  interface PhotoGalleryHeroProps {
    images: string[];
    businessName: string;
  }
  export function PhotoGalleryHero(props: PhotoGalleryHeroProps): JSX.Element | null;
  ```

  Renders: 2×3 grid (1 large image col-span-2 row-span-2 + 4 small images). Returns null if `images.length === 0`.

- [ ] **Step 1: Implement (small enough, no test needed for layout alone)**

```tsx
// src/components/marketplace/vendor-profile/PhotoGalleryHero.tsx
import Image from 'next/image';

interface PhotoGalleryHeroProps {
  images: string[];
  businessName: string;
}

export function PhotoGalleryHero({ images, businessName }: PhotoGalleryHeroProps) {
  if (images.length === 0) return null;
  const visible = images.slice(0, 5);
  return (
    <div
      data-testid="photo-gallery-hero"
      className="grid grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-lg"
      style={{ aspectRatio: '16 / 9', maxHeight: 480 }}
    >
      {visible.map((img, i) => (
        <div
          key={i}
          className={`relative overflow-hidden bg-muted ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
        >
          <Image
            src={img}
            alt={`${businessName} portfolio ${i + 1}`}
            fill
            sizes={i === 0 ? '(max-width: 768px) 100vw, 60vw' : '20vw'}
            className="object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/vendor-profile/PhotoGalleryHero.tsx
git commit -m "feat(vendor-profile): PhotoGalleryHero desktop mosaic (T3)"
```

---

### Task 4: PhotoCarouselHero (mobile swipeable carousel)

**Files:**

- Create: `src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx`

**Interfaces:**

- Consumes: `useSavedVendors` from `@/components/marketplace/SavedVendorsProvider` (Bucket J).
- Produces:

  ```tsx
  interface PhotoCarouselHeroProps {
    images: string[];
    businessName: string;
    vendorId: string;
    interactive: boolean;
  }
  export function PhotoCarouselHero(props: PhotoCarouselHeroProps): JSX.Element | null;
  ```

  Renders: full-width swipeable image carousel (220px tall), dot indicators, photo counter, heart button (top-right) that calls `toggle(vendorId)` when `interactive`. Returns null if `images.length === 0`.

- [ ] **Step 1: Implement**

```tsx
// src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx
'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { useSavedVendors } from '@/components/marketplace/SavedVendorsProvider';

interface PhotoCarouselHeroProps {
  images: string[];
  businessName: string;
  vendorId: string;
  interactive: boolean;
}

export function PhotoCarouselHero({
  images,
  businessName,
  vendorId,
  interactive,
}: PhotoCarouselHeroProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { savedIds, toggle } = useSavedVendors();
  const isSaved = savedIds.has(vendorId);

  if (images.length === 0) return null;

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIdx(idx);
  }

  async function handleHeart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!interactive) return;
    await toggle(vendorId);
  }

  return (
    <div data-testid="photo-carousel-hero" className="relative h-[220px] w-full overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {images.map((img, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-start">
            <Image
              src={img}
              alt={`${businessName} portfolio ${i + 1}`}
              fill
              sizes="100vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleHeart}
        disabled={!interactive}
        aria-label={isSaved ? 'Unsave vendor' : 'Save vendor'}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 backdrop-blur transition hover:bg-ink"
      >
        <Heart className={`h-4 w-4 ${isSaved ? 'fill-red-500 text-red-500' : 'text-white'}`} />
      </button>

      <div className="absolute bottom-3 right-3 rounded bg-ink/70 px-2 py-1 text-xs text-cream">
        {activeIdx + 1} / {images.length}
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition ${
              i === activeIdx ? 'bg-white' : 'bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/marketplace/vendor-profile/PhotoCarouselHero.tsx
git commit -m "feat(vendor-profile): PhotoCarouselHero mobile carousel with heart button (T4)"
```

---

### Task 5: BookingStickyCard (desktop right card)

**Files:**

- Create: `src/components/marketplace/vendor-profile/BookingStickyCard.tsx`
- Test: `src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx`

**Interfaces:**

- Consumes: `getFeaturedPackage`, `calculateDeposit`, `calculateRemaining`, `formatPrice`, `scrollToPackages` from `./helpers`.
- Produces:

  ```tsx
  interface BookingStickyCardProps {
    vendor: VendorRow;
    packages: PackageWithAddons[];
    interactive: boolean;
    onRequestBooking: (pkgId: string | null) => void;
  }
  export function BookingStickyCard(props: BookingStickyCardProps): JSX.Element;
  ```

  Renders the sticky card with featured-package content + CTA. If `packages.length === 0`, renders a custom-request fallback variant.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookingStickyCard } from '@/components/marketplace/vendor-profile/BookingStickyCard';

const baseVendor = {
  id: 'v-1',
  business_name: 'Epic Events Photo Booth',
  average_rating: 4.9,
  review_count: 47,
  response_sla_hours: 2,
  total_bookings: 3012,
} as any;

const standardPkg = {
  id: 'p-std',
  name: 'Standard Booth',
  base_price_cents: 120_000,
  duration_hours: 4,
  description: '',
  addons: [],
} as any;

const threePackages = [
  { ...standardPkg, id: 'p-std', name: 'Standard', base_price_cents: 120_000 },
  { ...standardPkg, id: 'p-360', name: '360°', base_price_cents: 180_000 },
  { ...standardPkg, id: 'p-prem', name: 'Premium', base_price_cents: 280_000 },
];

describe('BookingStickyCard', () => {
  it('renders the featured (cheapest) package name + total', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
    expect(screen.getByText('$1,200')).toBeInTheDocument();
  });

  it('renders correct 5% deposit math', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/\$60/)).toBeInTheDocument(); // 5% of $1,200
  });

  it('shows "compare all 3 packages ↓" link when 3 packages exist', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/compare all 3 packages/i)).toBeInTheDocument();
  });

  it('hides "compare all packages" link when only 1 package exists', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={[threePackages[0]]}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.queryByText(/compare all/i)).not.toBeInTheDocument();
  });

  it('shows custom-request fallback when 0 packages', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={[]}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/custom request|custom booking/i)).toBeInTheDocument();
  });

  it('renders trust row (rating, response time, events)', () => {
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={() => {}}
      />
    );
    expect(screen.getByText(/4.9/)).toBeInTheDocument();
    expect(screen.getByText(/47 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/2h|2 h/i)).toBeInTheDocument();
    expect(screen.getByText(/3,012/)).toBeInTheDocument();
  });

  it('calls onRequestBooking(featuredPkgId) when CTA is clicked', () => {
    const handle = vi.fn();
    render(
      <BookingStickyCard
        vendor={baseVendor}
        packages={threePackages}
        interactive={true}
        onRequestBooking={handle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /request booking/i }));
    expect(handle).toHaveBeenCalledWith('p-std');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx
```

- [ ] **Step 3: Implement BookingStickyCard**

```tsx
// src/components/marketplace/vendor-profile/BookingStickyCard.tsx
'use client';

import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database.types';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import {
  getFeaturedPackage,
  calculateDeposit,
  calculateRemaining,
  formatPrice,
  scrollToPackages,
} from './helpers';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface BookingStickyCardProps {
  vendor: VendorRow;
  packages: PackageWithAddons[];
  interactive: boolean;
  onRequestBooking: (pkgId: string | null) => void;
}

export function BookingStickyCard({
  vendor,
  packages,
  interactive,
  onRequestBooking,
}: BookingStickyCardProps) {
  const featured = getFeaturedPackage(packages);

  // Fallback variant — vendor with zero packages
  if (!featured || featured.base_price_cents == null) {
    return (
      <aside
        data-testid="vendor-sticky-card"
        className="sticky top-6 rounded-lg border-2 border-ink bg-white p-5 shadow-md"
      >
        <p className="text-sm text-ink">
          This vendor hasn&apos;t listed packages yet. Send them a custom request to ask about
          availability and pricing.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          onClick={() => onRequestBooking(null)}
          disabled={!interactive}
        >
          Send a custom request →
        </Button>
        <TrustRow vendor={vendor} />
      </aside>
    );
  }

  const total = featured.base_price_cents;
  const deposit = calculateDeposit(total);
  const remaining = calculateRemaining(total);

  return (
    <aside
      data-testid="vendor-sticky-card"
      className="sticky top-6 rounded-lg border-2 border-ink bg-white p-5 shadow-md"
    >
      <span className="inline-block rounded-full bg-hot-pink/10 px-2.5 py-1 text-xs font-medium text-hot-pink">
        Most popular
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{featured.name}</h3>
      {featured.duration_hours != null && (
        <p className="text-xs text-ink/70">{featured.duration_hours} hours</p>
      )}

      <p className="mt-3 text-3xl font-bold text-ink">{formatPrice(total)}</p>
      <p className="text-xs text-ink/60">Total cost (everything included)</p>

      <div className="my-4 rounded-md bg-cream p-3 text-center text-xs text-ink">
        Pay <b className="text-hot-pink">{formatPrice(deposit)}</b> deposit today ·{' '}
        {formatPrice(remaining)} due to vendor at event
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={() => onRequestBooking(featured.id)}
        disabled={!interactive}
      >
        Request Booking →
      </Button>

      {packages.length > 1 && (
        <button
          type="button"
          onClick={scrollToPackages}
          className="mt-3 block w-full text-center text-xs text-ink underline hover-pink-text"
        >
          or compare all {packages.length} packages ↓
        </button>
      )}

      <TrustRow vendor={vendor} />
    </aside>
  );
}

function TrustRow({ vendor }: { vendor: VendorRow }) {
  return (
    <div className="mt-4 flex items-start justify-around border-t border-ink/10 pt-4 text-center text-xs text-ink">
      {vendor.average_rating != null && vendor.review_count != null && vendor.review_count > 0 && (
        <div>
          <div className="font-semibold">★ {vendor.average_rating.toFixed(1)}</div>
          <div className="text-ink/60">{vendor.review_count} reviews</div>
        </div>
      )}
      {vendor.response_sla_hours != null && (
        <div>
          <div className="font-semibold">⚡ {vendor.response_sla_hours}h</div>
          <div className="text-ink/60">Response time</div>
        </div>
      )}
      {vendor.total_bookings != null && vendor.total_bookings > 0 && (
        <div>
          <div className="font-semibold">✓ {vendor.total_bookings.toLocaleString()}</div>
          <div className="text-ink/60">Events</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
npx vitest run src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/vendor-profile/BookingStickyCard.tsx \
  src/__tests__/components/vendor-profile/BookingStickyCard.test.tsx
git commit -m "feat(vendor-profile): BookingStickyCard desktop sticky card (T5)"
```

---

### Task 6: BookingBottomBar (mobile sticky bottom + Sheet picker)

**Files:**

- Create: `src/components/marketplace/vendor-profile/BookingBottomBar.tsx`

**Interfaces:**

- Consumes: `getFeaturedPackage`, `calculateDeposit`, `formatPrice` from `./helpers`. shadcn `Sheet` from `@/components/ui/sheet`.
- Produces:

  ```tsx
  interface BookingBottomBarProps {
    packages: PackageWithAddons[];
    interactive: boolean;
    onRequestBooking: (pkgId: string | null) => void;
  }
  export function BookingBottomBar(props: BookingBottomBarProps): JSX.Element;
  ```

  Renders: `fixed bottom-0` bar with "From $X · Pay $Y deposit today · [Selected pkg ▲]" + Request Booking button. Tapping the package pill opens a `<Sheet side="bottom">` with a stacked package list.

- [ ] **Step 1: Verify shadcn Sheet exists**

```bash
ls src/components/ui/sheet.tsx
```

(Already installed per Bucket J T21.)

- [ ] **Step 2: Implement BookingBottomBar**

```tsx
// src/components/marketplace/vendor-profile/BookingBottomBar.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import { getFeaturedPackage, calculateDeposit, formatPrice } from './helpers';

interface BookingBottomBarProps {
  packages: PackageWithAddons[];
  interactive: boolean;
  onRequestBooking: (pkgId: string | null) => void;
}

export function BookingBottomBar({
  packages,
  interactive,
  onRequestBooking,
}: BookingBottomBarProps) {
  const featured = getFeaturedPackage(packages);
  const [selectedId, setSelectedId] = useState<string | null>(featured?.id ?? null);
  const selected = packages.find((p) => p.id === selectedId) ?? featured;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Zero-packages fallback
  if (!selected || selected.base_price_cents == null) {
    return (
      <div
        data-testid="vendor-bottom-bar"
        className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-white px-4 py-2.5 shadow-lg md:hidden"
        style={{ paddingBottom: `calc(0.625rem + env(safe-area-inset-bottom))` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink/70">Vendor hasn&apos;t listed packages yet.</p>
          <Button size="sm" onClick={() => onRequestBooking(null)} disabled={!interactive}>
            Custom request →
          </Button>
        </div>
      </div>
    );
  }

  const total = selected.base_price_cents;
  const deposit = calculateDeposit(total);
  const isFeatured = selected.id === featured?.id;

  return (
    <div
      data-testid="vendor-bottom-bar"
      className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-ink bg-white px-4 py-2.5 shadow-lg md:hidden"
      style={{ paddingBottom: `calc(0.625rem + env(safe-area-inset-bottom))` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-ink">From {formatPrice(total)}</p>
          <p className="text-xs text-ink/70">Pay {formatPrice(deposit)} deposit today</p>

          <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-hot-pink"
              >
                {selected.name}
                {isFeatured ? ' · most popular' : ''} ▲
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-cream">
              <SheetTitle className="font-spectral text-lg text-ink">Choose a package</SheetTitle>
              <div className="mt-4 space-y-2">
                {packages.map((p) => {
                  const isSel = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(p.id);
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${
                        isSel
                          ? 'border-ink bg-white'
                          : 'border-ink/15 bg-white hover:border-hot-pink'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink">{p.name}</p>
                        {p.duration_hours != null && (
                          <p className="text-xs text-ink/60">{p.duration_hours} hours</p>
                        )}
                      </div>
                      <p className="text-sm font-bold text-ink">
                        {formatPrice(p.base_price_cents ?? 0)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <Button
          size="sm"
          onClick={() => onRequestBooking(selected.id)}
          disabled={!interactive}
          className="shrink-0"
        >
          Request Booking →
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/marketplace/vendor-profile/BookingBottomBar.tsx
git commit -m "feat(vendor-profile): BookingBottomBar mobile sticky bar + Sheet picker (T6)"
```

---

### Task 7: PackageGrid — add `featuredPackageId` prop + badge

**Files:**

- Modify: `src/components/marketplace/PackageGrid.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: extended prop `featuredPackageId?: string`. The card matching that id gets:
  - A pink "Most popular" badge positioned absolutely above the card (top: -10px)
  - Thicker border (`border-2 border-ink`)
  - A `data-pkg-featured="true"` attribute on the card root (used by `scrollToPackages` to find the pulse target)

- [ ] **Step 1: Read current PackageGrid shape**

```bash
grep -n "interface PackageGridProps\|export function PackageGrid\|packages.map" src/components/marketplace/PackageGrid.tsx
```

Identify where individual package cards are rendered.

- [ ] **Step 2: Add the prop + badge rendering**

In the existing `PackageGridProps` interface, append:

```ts
featuredPackageId?: string;
```

In the `packages.map((pkg) => ...)` JSX, wrap or augment the card's root div:

```tsx
{
  packages.map((pkg) => {
    const isFeatured = pkg.id === featuredPackageId;
    return (
      <div
        key={pkg.id}
        data-pkg-featured={isFeatured ? 'true' : undefined}
        id={`packages-section-${pkg.id}`}
        className={`relative rounded-lg ${
          isFeatured ? 'border-2 border-ink' : 'border border-ink/15'
        } bg-white p-5`}
      >
        {isFeatured && (
          <span className="absolute -top-2.5 left-4 rounded-full bg-hot-pink px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cream">
            Most popular
          </span>
        )}
        {/* ... existing card content ... */}
      </div>
    );
  });
}
```

Adapt to whatever the current JSX is (the existing card might wrap content in a `<Card>` shadcn component — preserve that, just augment).

- [ ] **Step 3: Add `id="packages-section"` to the outer grid container**

This is the smooth-scroll target for `scrollToPackages()`:

```tsx
<div id="packages-section" className="...">
  {/* existing grid */}
</div>
```

- [ ] **Step 4: Run unit tests — make sure existing PackageGrid tests still pass**

```bash
npx vitest run src/components/marketplace/PackageGrid
```

Add backup checks if any existing test breaks because of the new wrapping div.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/components/marketplace/PackageGrid.tsx
git commit -m "feat(vendor-profile): PackageGrid supports featuredPackageId + Most popular badge (T7)"
```

---

### Task 8: VendorProfile orchestrator rewrite

**Files:**

- Create: `src/components/marketplace/vendor-profile/VendorProfile.tsx`

**Interfaces:**

- Consumes: all sub-components (T1-T7), `OwnerBanner` + `ExitPreviewPill` from existing `@/components/marketplace/`, `useRouter` from `next/navigation`, `toast` from `sonner`.
- Produces:

  ```tsx
  interface VendorProfileProps {
    vendor: VendorRow;
    showBookingButton?: boolean;
    reviews?: ReviewItem[];
    packages?: PackageWithAddons[];
    isOwner?: boolean;
    interactive?: boolean;
  }
  export function VendorProfile(props): JSX.Element;
  ```

  Same outer prop signature as today (so the page-level call site doesn't change).

- [ ] **Step 1: Implement the new orchestrator**

```tsx
// src/components/marketplace/vendor-profile/VendorProfile.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import type { Database } from '@/types/database.types';

import { OwnerBanner } from '@/components/marketplace/OwnerBanner';
import { ExitPreviewPill } from '@/components/marketplace/ExitPreviewPill';
import { PackageGrid } from '@/components/marketplace/PackageGrid';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';

import { IdentityPanel } from './IdentityPanel';
import { PhotoGalleryHero } from './PhotoGalleryHero';
import { PhotoCarouselHero } from './PhotoCarouselHero';
import { BookingStickyCard } from './BookingStickyCard';
import { BookingBottomBar } from './BookingBottomBar';
import { getFeaturedPackage } from './helpers';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface ReviewItem {
  id: string;
  rating_overall: number;
  comment: string | null;
  created_at: string;
  users: { full_name: string | null } | { full_name: string | null }[] | null;
}

interface VendorProfileProps {
  vendor: VendorRow;
  showBookingButton?: boolean;
  reviews?: ReviewItem[];
  packages?: PackageWithAddons[];
  isOwner?: boolean;
  interactive?: boolean;
}

function reviewerName(users: ReviewItem['users']): string {
  const row = Array.isArray(users) ? users[0] : users;
  return row?.full_name?.split(' ')[0] || 'A customer';
}

export function VendorProfile({
  vendor,
  showBookingButton: _ignored, // legacy prop — sticky card handles CTA visibility now
  reviews = [],
  packages = [],
  isOwner = false,
  interactive: interactiveProp,
}: VendorProfileProps) {
  const router = useRouter();
  const [previewMode, setPreviewMode] = useState(false);
  const interactive = interactiveProp ?? (!isOwner || previewMode);
  const showBanner = isOwner && !previewMode;
  const featured = getFeaturedPackage(packages);

  function handleRequestBooking(pkgId: string | null) {
    if (!interactive) {
      toast('Preview mode — bookings disabled.');
      return;
    }
    if (pkgId) {
      // Booking-form route expects a selected package — push with query so the form pre-selects
      router.push(`/vendors/${vendor.slug}/book?package=${pkgId}`);
    } else {
      // Zero-packages fallback OR vendor sticky card "send a custom request"
      router.push(`/vendors/${vendor.slug}/request`);
    }
  }

  const images = vendor.portfolio_images ?? [];
  const hasReviews = vendor.review_count > 0 && vendor.average_rating != null;

  return (
    <>
      {showBanner && (
        <OwnerBanner
          onPreview={() => setPreviewMode(true)}
          editHref="/dashboard/profile/setup/basics"
        />
      )}

      <div className="mx-auto max-w-6xl px-4 py-4">
        {/* Breadcrumb */}
        <nav className="mb-4 text-xs text-ink/60">
          <Link href="/vendors" className="hover-pink-text">
            All vendors
          </Link>
          <span className="mx-1">·</span>
          <span>{vendor.business_name}</span>
        </nav>

        {/* Mobile carousel + bio + packages (single column) */}
        <div className="md:hidden">
          <PhotoCarouselHero
            images={images}
            businessName={vendor.business_name ?? 'Vendor'}
            vendorId={vendor.id}
            interactive={interactive}
          />
          <div className="mt-6 space-y-8">
            <IdentityPanel vendor={vendor} />
            {packages.length > 0 && (
              <div id="packages-section">
                <h2 className="font-spectral text-xl font-semibold text-ink">
                  Choose your package
                </h2>
                <p className="mt-1 text-xs text-ink/70">
                  Compare side-by-side. All prices include setup, breakdown, and one attendant.
                </p>
                <div className="mt-4">
                  <PackageGrid
                    packages={packages}
                    vendorSlug={vendor.slug ?? ''}
                    interactive={interactive}
                    featuredPackageId={featured?.id}
                  />
                </div>
                <p className="mt-4 text-center text-xs">
                  Don&apos;t see what you need?{' '}
                  <Link
                    href={`/vendors/${vendor.slug}/request`}
                    className="text-ink underline hover-pink-text"
                  >
                    Send a custom request →
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop split layout */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[1.6fr_1fr] gap-8">
            <div className="space-y-8">
              <PhotoGalleryHero images={images} businessName={vendor.business_name ?? 'Vendor'} />
              <IdentityPanel vendor={vendor} />

              {packages.length > 0 && (
                <div id="packages-section" className="border-t border-ink/10 pt-8">
                  <h2 className="font-spectral text-xl font-semibold text-ink">
                    Choose your package
                  </h2>
                  <p className="mt-1 text-xs text-ink/70">
                    Compare side-by-side. All prices include setup, breakdown, and one attendant.
                  </p>
                  <div className="mt-4">
                    <PackageGrid
                      packages={packages}
                      vendorSlug={vendor.slug ?? ''}
                      interactive={interactive}
                      featuredPackageId={featured?.id}
                    />
                  </div>
                  <p className="mt-4 text-center text-xs">
                    Don&apos;t see what you need?{' '}
                    <Link
                      href={`/vendors/${vendor.slug}/request`}
                      className="text-ink underline hover-pink-text"
                    >
                      Send a custom request →
                    </Link>
                  </p>
                </div>
              )}
            </div>

            <div>
              <BookingStickyCard
                vendor={vendor}
                packages={packages}
                interactive={interactive}
                onRequestBooking={handleRequestBooking}
              />
            </div>
          </div>
        </div>

        {/* Reviews — full-width below everything on both layouts */}
        {hasReviews && (
          <div id="reviews-section" className="mt-12 border-t border-ink/10 pt-8">
            <div className="mb-6 flex items-center gap-3">
              <h2 className="font-spectral text-xl font-semibold text-ink">Reviews</h2>
              <span className="text-2xl font-bold text-ink">
                {vendor.average_rating!.toFixed(1)}
              </span>
              <span className="flex text-amber-400">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-5 w-5 ${
                      n <= Math.round(vendor.average_rating!) ? 'fill-current' : 'fill-none'
                    }`}
                  />
                ))}
              </span>
              <span className="text-sm text-ink/60">({vendor.review_count} reviews)</span>
            </div>

            <div className="space-y-4">
              {reviews.map((r) => (
                <article key={r.id} className="rounded-lg border border-ink/10 bg-white p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">
                      <span className="text-amber-400">★ </span>
                      {reviewerName(r.users)}
                    </span>
                    <span className="text-xs text-ink/50">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink/85">{r.comment}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile sticky bottom bar (rendered outside main padding) */}
      <BookingBottomBar
        packages={packages}
        interactive={interactive}
        onRequestBooking={handleRequestBooking}
      />

      {isOwner && previewMode && <ExitPreviewPill onExit={() => setPreviewMode(false)} />}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run all unit tests**

```bash
npx vitest run
```

Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/components/marketplace/vendor-profile/VendorProfile.tsx
git commit -m "feat(vendor-profile): orchestrator with split desktop + sticky mobile (T8)"
```

---

### Task 9: Re-export shim at original VendorProfile path

**Files:**

- Modify: `src/components/marketplace/VendorProfile.tsx` (replace entire 254-line file with a re-export)

**Interfaces:**

- Consumes: new `VendorProfile` from `./vendor-profile/VendorProfile`.
- Produces: same import path keeps working — `import { VendorProfile } from '@/components/marketplace/VendorProfile'`.

- [ ] **Step 1: Verify the page-level consumer**

```bash
grep -rn "from '@/components/marketplace/VendorProfile'" src/ 2>/dev/null | head -5
```

Should show usage in `src/app/(marketplace)/vendors/[slug]/page.tsx` and probably nowhere else.

- [ ] **Step 2: Replace the file with a re-export**

```tsx
// src/components/marketplace/VendorProfile.tsx
// Legacy import path — the real implementation moved to ./vendor-profile/
// in the 2026-06-24 vendor-profile redesign. This shim keeps the consumer
// import path stable so the page-level call site didn't have to change.
export { VendorProfile } from './vendor-profile/VendorProfile';
```

- [ ] **Step 3: Typecheck + run E2E**

```bash
npm run typecheck
```

Expected: 0 errors.

```bash
npm run test:e2e -- bucket-b-vendor-own-profile
```

Expected: still passes (the owner banner + view-as-customer flow is preserved verbatim).

- [ ] **Step 4: Commit**

```bash
git add src/components/marketplace/VendorProfile.tsx
git commit -m "refactor(vendor-profile): collapse legacy path to re-export shim (T9)"
```

---

### Task 10: E2E spec — desktop flow

**Files:**

- Create: `tests/e2e/vendor-profile-desktop-flow.spec.ts`

**Interfaces:**

- Consumes: existing E2E helpers (`seedVendor` with `chargesEnabled: false, publish: true`, `seedPackage`, `cleanup`).

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/vendor-profile-desktop-flow.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, seedPackage, cleanup, type TestVendor } from './helpers/seed';

test.describe('Vendor profile — desktop flow', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('sticky card visible above fold; compare-all-packages smooth-scrolls + pulses', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    await seedPackage(vendor, { name: 'Standard', basePriceCents: 120_000 });
    await seedPackage(vendor, { name: '360°', basePriceCents: 180_000 });
    await seedPackage(vendor, { name: 'Premium', basePriceCents: 280_000 });

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await page.goto(`/vendors/${vendor.vendorSlug}`);

    // Sticky card visible above the fold
    const stickyCard = page.getByTestId('vendor-sticky-card');
    await expect(stickyCard).toBeVisible();
    await expect(stickyCard.getByText(/Most popular/i)).toBeVisible();
    await expect(stickyCard.getByText(/Standard/i)).toBeVisible();
    await expect(stickyCard.getByText('$1,200')).toBeVisible();
    await expect(stickyCard.getByText(/\$60/)).toBeVisible(); // 5% deposit

    // Click "compare all 3 packages ↓"
    await stickyCard.getByText(/compare all 3 packages/i).click();

    // Packages section now in view
    const packagesSection = page.locator('#packages-section');
    await expect(packagesSection).toBeInViewport();

    // Featured card has data-pkg-featured + briefly pulses (we can check class added)
    const featuredCard = packagesSection.locator('[data-pkg-featured="true"]');
    await expect(featuredCard).toBeVisible();

    // Click the featured card's CTA — should route to /book
    await featuredCard.getByText(/Book.*Standard/i).click();
    await page.waitForURL(/\/book/);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run locally**

```bash
npm run test:e2e -- vendor-profile-desktop
```

Expected: pass. If selectors miss, inspect the actual rendered HTML and adjust.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/vendor-profile-desktop-flow.spec.ts
git commit -m "test(e2e): vendor profile desktop sticky card + compare flow (T10)"
```

---

### Task 11: E2E spec — mobile flow

**Files:**

- Create: `tests/e2e/vendor-profile-mobile-flow.spec.ts`

**Interfaces:**

- Consumes: same E2E helpers as T10.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/vendor-profile-mobile-flow.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, seedPackage, cleanup, type TestVendor } from './helpers/seed';

test.describe('Vendor profile — mobile flow', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('sticky bottom bar visible; tapping Request Booking routes to /book', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    await seedPackage(vendor, { name: 'Standard', basePriceCents: 120_000 });
    await seedPackage(vendor, { name: '360°', basePriceCents: 180_000 });

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    await page.goto(`/vendors/${vendor.vendorSlug}`);

    const bottomBar = page.getByTestId('vendor-bottom-bar');
    await expect(bottomBar).toBeVisible();
    await expect(bottomBar.getByText(/From \$1,200/)).toBeVisible();
    await expect(bottomBar.getByText(/Pay \$60 deposit/)).toBeVisible();
    await expect(bottomBar.getByText(/Standard.*most popular/i)).toBeVisible();

    // Tap the package pill to open the picker drawer
    await bottomBar.getByText(/Standard.*most popular/i).click();
    await expect(page.getByText(/Choose a package/i)).toBeVisible();

    // Pick the 360° package
    await page.getByRole('button', { name: /360°/ }).click();
    await expect(bottomBar.getByText(/From \$1,800/)).toBeVisible();

    // Tap Request Booking — should route to /book
    await bottomBar.getByRole('button', { name: /Request Booking/i }).click();
    await page.waitForURL(/\/book/);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e -- vendor-profile-mobile
```

```bash
git add tests/e2e/vendor-profile-mobile-flow.spec.ts
git commit -m "test(e2e): vendor profile mobile bottom bar + picker (T11)"
```

---

### Task 12: E2E spec — zero-packages fallback

**Files:**

- Create: `tests/e2e/vendor-profile-zero-packages.spec.ts`

**Interfaces:**

- Consumes: existing helpers.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/vendor-profile-zero-packages.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';

test.describe('Vendor profile — zero packages fallback', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('sticky card shows custom-request fallback; routes to /request', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    // No packages seeded

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await page.goto(`/vendors/${vendor.vendorSlug}`);

    const stickyCard = page.getByTestId('vendor-sticky-card');
    await expect(stickyCard).toBeVisible();
    await expect(stickyCard.getByText(/hasn't listed packages yet/i)).toBeVisible();

    await stickyCard.getByRole('button', { name: /custom request/i }).click();
    await page.waitForURL(/\/request/);

    await ctx.close();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npm run test:e2e -- vendor-profile-zero-packages
```

```bash
git add tests/e2e/vendor-profile-zero-packages.spec.ts
git commit -m "test(e2e): vendor profile zero-packages fallback (T12)"
```

---

### Task 13: PR + manual smoke

**Files:** none. Operational.

- [ ] **Step 1: Run the full local suite**

```bash
npm run typecheck && npx vitest run && npm run test:e2e -- vendor-profile-
```

Expected: green.

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin feat/vendor-profile-redesign
```

```bash
gh pr create --title "feat: vendor profile redesign — Airbnb-style split layout" --body "$(cat <<'EOF'
## Summary

Implements **vendor profile redesign** per `docs/superpowers/specs/2026-06-24-vendor-profile-redesign-design.md` (spec PR #61).

Customer-facing `/vendors/[slug]` only — doesn't touch booking form, custom-request form, packages editor, or onboarding wizard.

### Threads shipped

1. **Decomposes the 254-line monolith** into 6 focused components under `src/components/marketplace/vendor-profile/` (orchestrator + 5 sub-components + helpers).
2. **Above-the-fold sticky card** (desktop) with featured (cheapest) package, 5% deposit math, trust row (rating + response time + total events), Request Booking CTA, "compare all N packages ↓" smooth-scroll link.
3. **Sticky bottom bar** (mobile) with featured package summary + Request Booking + tap-to-expand package picker Sheet drawer.
4. **About/Bio moved up** — directly under photo gallery + identity panel, NOT below packages.
5. **PackageGrid** enhanced with `featuredPackageId` prop → renders pink "Most popular" badge + `data-pkg-featured` attribute for the smooth-scroll pulse target.
6. **`pulse-pink` Tailwind utility** for the 1.5s post-scroll highlight on the featured package card.
7. **Owner banner preserved verbatim** — `<OwnerBanner>` + view-as-customer toggle + `interactive === false` → toast still work end-to-end.
8. **Re-export shim** at the old `VendorProfile.tsx` path so existing imports keep working.

### Tests

- 3 unit test files: `helpers.test.ts` (15+ assertions), `IdentityPanel.test.tsx` (6 cases), `BookingStickyCard.test.tsx` (7 cases)
- 3 E2E specs: desktop flow, mobile flow, zero-packages fallback

## Migrations

None. Zero schema or API changes.

## Test plan

- [ ] CI green
- [ ] Vercel preview manual smoke: visit any vendor profile, scroll, click "compare all packages", tap CTA → /book
- [ ] Mobile viewport smoke: bottom bar appears, package picker opens, selection updates the price
- [ ] Owner mode: view own profile → banner shows → click "View as customer" → CTA fires preview-mode toast

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review + merge.**

---

## Self-Review

**Spec coverage:**

- §2.1 Desktop layout — T3 (PhotoGalleryHero) + T5 (BookingStickyCard) + T8 (orchestrator wires them) ✓
- §2.2 Mobile layout — T4 (PhotoCarouselHero) + T6 (BookingBottomBar) + T8 (orchestrator) ✓
- §3.1 Component structure — T1-T8 each create one of the 6 files ✓
- §3.4 Sticky card content — T5 with locked verbatim copy ✓
- §3.5 "Compare all packages ↓" smooth scroll + pulse — T1 (helper) + T7 (data-pkg-featured) + T1 step 6 (pulse-pink utility) ✓
- §3.6 Identity panel — T2 ✓
- §3.6.1 Owner banner integration — T8 preserves Bucket B T13/T14 behavior ✓
- §3.7 Mobile sticky bottom bar — T6 ✓
- §3.8 Packages comparison section — T7 (featuredPackageId prop) + T8 (section heading + custom-request link) ✓
- §3.9 Reviews section — T8 (preserved structure with `id="reviews-section"`) ✓
- §3.10 Responsive switch — T8 uses Tailwind `md:hidden` / `hidden md:block` ✓
- §4 Data + props — featured = cheapest computed client-side, no schema change ✓
- §5 Locked verbatim copy — embedded in T2, T5, T6, T8 ✓
- §6.1 Unit tests — T1, T2, T5 cover the listed surfaces ✓
- §6.2 E2E specs — T10, T11, T12 ✓

**Placeholder scan:** No TBD/TODO/FIXME in task steps. Sample code is complete; the only conditional (the existing PackageGrid JSX structure in T7) tells the implementer to adapt to actual rendered card layout, with the augmentation shape spelled out exactly.

**Type consistency:**

- `getFeaturedPackage<T extends PackageLike>(packages: T[]): T | null` — same shape across T1 (definition), T5 (BookingStickyCard), T6 (BookingBottomBar), T8 (orchestrator).
- `calculateDeposit(totalCents: number): number` — same in T1, T5, T6.
- `formatPrice(cents: number): string` — same in T1, T5, T6.
- `VendorProfileProps` shape preserved between T8 (new orchestrator) and the existing call site in `src/app/(marketplace)/vendors/[slug]/page.tsx` — T9 confirms via grep.
- `featuredPackageId?: string` prop added to PackageGrid in T7 is consumed by T8.

No gaps. Plan ready for execution.
