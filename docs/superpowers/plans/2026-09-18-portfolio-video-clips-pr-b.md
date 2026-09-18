# Portfolio Video Clips — PR B (Public Display) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show a vendor's uploaded clips inline in their public profile gallery — a ▶-badged tile in the grid/carousel that opens the existing lightbox, which plays the clip.

**Architecture:** A pure merge helper turns `portfolio_images` (string[]) + `portfolio_videos` (Stream uid string[]) into one ordered `MediaItem[]` (photos first, clips after). All four display surfaces (desktop grid, mobile carousel, lightbox, and the profile's gating) consume that single ordered list, so the grid→lightbox index handoff stays consistent. Video tiles render the Cloudflare thumbnail + a ▶ badge; the lightbox plays a video item via the Cloudflare Stream **iframe embed** (no new dependency).

**Tech Stack:** Next.js (App Router), React, TypeScript, Vitest + Testing Library. Cloudflare Stream (iframe embed + thumbnail URL) — helpers already exist in `src/lib/cloudflare-stream.ts`.

**Spec:** `docs/superpowers/specs/2026-09-14-vendor-portfolio-video-clips-design.md` (see "Public display path").

**Depends on PR A (#169):** this branch is stacked on `feat/portfolio-video-clips`. After PR A merges to main, rebase this branch onto main.

## Global Constraints

- TypeScript strict; **no `any`** (eslint error; pre-commit blocks).
- Ordering is **photos first, then clips** (spec-locked). The whole gallery indexes into one `MediaItem[]`; never split the list per surface or the grid→lightbox index breaks.
- Playback uses the Cloudflare Stream **iframe embed** via `streamIframeUrl(uid)` (already in `src/lib/cloudflare-stream.ts`); video posters use `streamThumbnailUrl(uid)`. Do NOT add `@cloudflare/stream-react` or any player library.
- Video posters render with a plain `<img>` (Cloudflare host isn't in next.config remotePatterns; do not modify next.config in this PR).
- `hasGallery` gate counts total media (`>= 2`), not just photos.
- Existing gallery tests must stay green through the `string[]` → `MediaItem[]` prop change.
- Branch off `feat/portfolio-video-clips`; commit per task; full CI green before merge.

---

### Task 1: `portfolio-media` merge helper

**Files:**

- Create: `src/lib/portfolio-media.ts`
- Test: `src/__tests__/lib/portfolio-media.test.ts`

**Interfaces:**

- Produces: `type MediaItem = { type: 'image'; url: string } | { type: 'video'; uid: string }`; `mergePortfolioMedia(images: string[], videoUids: string[]): MediaItem[]` — photos first, then clips.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/portfolio-media.test.ts
import { describe, it, expect } from 'vitest';
import { mergePortfolioMedia } from '@/lib/portfolio-media';

describe('mergePortfolioMedia', () => {
  it('puts photos first, then clips, preserving order', () => {
    const r = mergePortfolioMedia(['p1', 'p2'], ['v1', 'v2']);
    expect(r).toEqual([
      { type: 'image', url: 'p1' },
      { type: 'image', url: 'p2' },
      { type: 'video', uid: 'v1' },
      { type: 'video', uid: 'v2' },
    ]);
  });

  it('handles empty videos and empty photos', () => {
    expect(mergePortfolioMedia(['p1'], [])).toEqual([{ type: 'image', url: 'p1' }]);
    expect(mergePortfolioMedia([], ['v1'])).toEqual([{ type: 'video', uid: 'v1' }]);
    expect(mergePortfolioMedia([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/portfolio-media.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/portfolio-media.ts
export type MediaItem = { type: 'image'; url: string } | { type: 'video'; uid: string };

/** One ordered media list for the whole gallery: photos first, clips after.
 *  Every display surface indexes into this, so the grid→lightbox handoff stays
 *  consistent. */
export function mergePortfolioMedia(images: string[], videoUids: string[]): MediaItem[] {
  return [
    ...images.map((url): MediaItem => ({ type: 'image', url })),
    ...videoUids.map((uid): MediaItem => ({ type: 'video', uid })),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/portfolio-media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio-media.ts src/__tests__/lib/portfolio-media.test.ts
git commit -m "feat(video): portfolio-media merge helper (photos first, clips after)"
```

---

### Task 2: `StreamClip` player (iframe embed)

**Files:**

- Create: `src/components/marketplace/vendor-profile/StreamClip.tsx`
- Test: `src/__tests__/components/vendor-profile/StreamClip.test.tsx`

**Interfaces:**

- Consumes: `streamIframeUrl` (`src/lib/cloudflare-stream.ts`).
- Produces: `<StreamClip uid={string} title={string} />` — a responsive Cloudflare Stream player iframe.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/vendor-profile/StreamClip.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StreamClip } from '@/components/marketplace/vendor-profile/StreamClip';

const OLD = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

describe('<StreamClip />', () => {
  it('renders an iframe pointing at the Cloudflare Stream embed for the uid', () => {
    const { container } = render(<StreamClip uid="abc123" title="Mandap reveal" />);
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe(
      'https://customer-test.cloudflarestream.com/abc123/iframe'
    );
    expect(iframe?.getAttribute('allowfullscreen')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/vendor-profile/StreamClip.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// src/components/marketplace/vendor-profile/StreamClip.tsx
import { streamIframeUrl } from '@/lib/cloudflare-stream';

export function StreamClip({ uid, title }: { uid: string; title: string }) {
  return (
    <div className="relative h-full w-full">
      <iframe
        src={streamIframeUrl(uid)}
        title={title}
        loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/vendor-profile/StreamClip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/vendor-profile/StreamClip.tsx src/__tests__/components/vendor-profile/StreamClip.test.tsx
git commit -m "feat(video): StreamClip player (Cloudflare iframe embed)"
```

---

### Task 3: Wire `MediaItem[]` through the gallery (grid, carousel, lightbox)

**Files (all under `src/components/marketplace/vendor-profile/`, plus the profile):**

- Modify: `VendorProfile.tsx` (~:95-99, :184) — read videos, merge, gate, pass `media`.
- Modify: `VendorGallery.tsx` (:8-31) — prop `images: string[]` → `media: MediaItem[]`; pass `media` to all three children.
- Modify: `PhotoGalleryHero.tsx` (:5-42) — prop → `media: MediaItem[]`; render video items as a `<img src={streamThumbnailUrl(uid)}>` poster + ▶ badge inside the existing `<button onClick={onOpen(i)}>`; image items unchanged (`<Image src={item.url}>`).
- Modify: `PhotoCarouselHero.tsx` (:6-57) — same treatment for the mobile carousel.
- Modify: `GalleryLightbox.tsx` (:8-164) — prop → `media: MediaItem[]`; the active slide renders `<StreamClip uid title>` (Task 2) for a video item, else the existing `<Image>`. Add `stopPropagation` on the video slide's container (`onPointerDown`/`onClick`) so player interaction doesn't trigger the framer drag/close. Keep per-slide remount via `key={index}`.
- Test: `src/__tests__/components/vendor-profile/gallery-video.test.tsx` (new).

**Interfaces:**

- Consumes: `MediaItem`, `mergePortfolioMedia` (Task 1); `streamThumbnailUrl` (lib); `StreamClip` (Task 2).

**Per-file guidance (read each file first; mirror its existing photo rendering):**

`VendorProfile.tsx`:

```tsx
const images = vendor.portfolio_images ?? [];
const videos = vendor.portfolio_videos ?? [];
const media = mergePortfolioMedia(images, videos);
const hasGallery = media.length >= 2;
// ...
<VendorGallery media={media} businessName={vendor.business_name ?? 'Vendor'} />;
```

`VendorGallery.tsx`: change the prop to `media: MediaItem[]`, `if (media.length === 0) return null;`, pass `media={media}` to `PhotoCarouselHero`, `PhotoGalleryHero`, and `GalleryLightbox`. The lightbox `index` stays a position into `media`.

Grid/carousel video tile (inside the existing map, when `item.type === 'video'`), e.g.:

```tsx
{
  item.type === 'video' ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- CF thumbnail */}
      <img src={streamThumbnailUrl(item.uid)} alt="" className="h-full w-full object-cover" />
      <span aria-hidden className="absolute inset-0 grid place-items-center bg-ink/15">
        <span className="flex size-11 items-center justify-center rounded-full bg-cream/90 text-ink">
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 translate-x-px">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </>
  ) : (
    <Image src={item.url} /* ...existing image props... */ />
  );
}
```

Keep each item wrapped in the existing `<button onClick={() => onOpen?.(i)}>` so tapping a video opens the lightbox at its index. Update `aria-label`s to say "clip" vs "photo" as appropriate.

`GalleryLightbox.tsx` active slide:

```tsx
{
  media[index ?? 0].type === 'video' ? (
    <div
      className="relative h-full w-full"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <StreamClip uid={media[index ?? 0].uid} title={`${businessName} clip`} />
    </div>
  ) : (
    <Image src={media[index ?? 0].url} /* ...existing... */ />
  );
}
```

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/vendor-profile/gallery-video.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoGalleryHero } from '@/components/marketplace/vendor-profile/PhotoGalleryHero';
import type { MediaItem } from '@/lib/portfolio-media';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const OLD = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-test';
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

describe('<PhotoGalleryHero /> with video items', () => {
  it('renders a play affordance on video items and a button per item', () => {
    const media: MediaItem[] = [
      { type: 'image', url: 'https://x/p1.jpg' },
      { type: 'video', uid: 'vid1' },
    ];
    render(<PhotoGalleryHero media={media} businessName="Priya" onOpen={() => {}} />);
    // one open button per media item
    expect(screen.getAllByRole('button')).toHaveLength(2);
    // the video item pulls the CF thumbnail
    const thumb = document.querySelector('img[src*="customer-test.cloudflarestream.com/vid1"]');
    expect(thumb).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/vendor-profile/gallery-video.test.tsx`
Expected: FAIL (PhotoGalleryHero still takes `images`, no video rendering).

- [ ] **Step 3: Implement the refactor across the five files** (per the per-file guidance above). Read each file first and mirror its existing structure; only the item-render branch and the prop type change.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/__tests__/components/vendor-profile && npx tsc --noEmit`
Expected: the new test passes, existing vendor-profile tests still pass, typecheck clean. Then run the full suite: `npm test` (all green — existing gallery/lightbox tests must survive the prop change; update them to pass `media` if they construct props directly).

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/vendor-profile/ src/__tests__/components/vendor-profile/
git commit -m "feat(video): show clips inline in the profile gallery + lightbox"
```

---

## PR B definition of done

- Clips appear inline (photos first) in desktop grid + mobile carousel with a ▶ badge; tapping opens the lightbox at the right index; the lightbox plays the clip via the Stream iframe.
- `hasGallery` counts total media; existing photo behavior unchanged.
- Full unit suite green; typecheck + lint clean; `next build` clean (run it with the dev server stopped).
- Rebase onto main after PR A (#169) merges; open PR B.
