# Vendor Portfolio Video Clips — Design

**Date:** 2026-09-14
**Status:** Approved for planning
**Author:** Claude (with Sardar)

## Overview

Let vendors upload short video clips into their portfolio, shown **inline mixed
with photos** in the profile gallery. Self-hosted on UploadThing (v7). This is a
**pilot** with deliberately tight caps to control cost on the free tier.

Follows PR #168 (photo upload hardening), which established the uploader
architecture this extends.

## Goals

- Vendors upload short clips (reels-style) from onboarding **and** the CRM profile editor.
- Clips appear inline in the public gallery grid/carousel with a ▶ badge; tapping opens the existing lightbox, which plays the clip.
- Cost stays controlled via tight caps.

## Non-goals (explicitly out of scope)

- **Video transcoding** (Mux / Cloudflare Stream). Decided: ship with the HEVC caveat below. Transcoding is a separate, larger project.
- **True photo/video interleaving.** Ordering is photos-first, clips-after. Arbitrary interleaving would need a mixed-media model (rejected below).
- **Migrating storage off UploadThing** (e.g. Cloudflare R2). Noted as the known cost follow-up; not this PR.
- Editing/trimming clips in-app; captions; per-clip covers.

## Locked decisions

| Decision           | Choice                                                                 | Rationale                                                             |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Storage model      | New `portfolio_videos TEXT[]` column, separate from `portfolio_images` | Low-risk; photos untouched; caps independent                          |
| Display order      | Photos first, clips after                                              | Featured tile stays a strong photo; no interleave info in two columns |
| Caps               | ≤20s duration, ≤32MB, max 3 clips/vendor                               | Lowest cost; forces reels-style; easy to loosen later                 |
| Accept types       | `video/mp4`, `video/quicktime` (.mov)                                  | Cover iPhone + standard exports                                       |
| HEVC/.mov playback | Ship with caveat, no transcoding                                       | No cheap client fix; pilot signal                                     |
| Player             | Native `<video controls playsInline>`                                  | No library; matches HeroVideoBackdrop precedent                       |

## The HEVC caveat (known limitation)

iPhones record **HEVC in a .mov container** by default ("High Efficiency"). Desktop
Chrome/Firefox often can't decode HEVC, so such a clip may be a black box for a
laptop viewer even though it plays on the vendor's phone. UploadThing does not
transcode. We accept this for the pilot: accept mp4+mov, nudge vendors toward
"Most Compatible" recording in the upload UI helper text, and treat playback gaps
as a signal for whether transcoding is worth building. The `<video>` element shows
native controls; a clip that fails to decode simply won't play (no crash).

## Rejected alternative — mixed-media JSONB

Migrating `portfolio_images` → `portfolio_media JSONB [{type,url}]` would allow true
interleaving but rewrites **every** read/write of portfolio media (four positional
display sites + all write paths + types). Rejected as YAGNI for a 2–3-clip pilot.

## Data model

New column on `vendor_profiles`:

```sql
-- supabase/migrations/00078_vendor_portfolio_videos.sql
ALTER TABLE vendor_profiles
  ADD COLUMN portfolio_videos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```

- Hand-patch `src/types/database.types.ts` `vendor_profiles` Row (`portfolio_videos: string[]`), Insert/Update (`portfolio_videos?: string[]`) — mirroring `portfolio_images` (per the types-regen-pending policy; do not run `gen types`).
- Migration applied to dev by Claude via psql; **prod applied by user** (migration-apply policy).

## Media merge helper (new, pure, testable)

`src/lib/portfolio-media.ts`:

```ts
export type MediaItem = { type: 'image' | 'video'; url: string };
/** Photos first, then clips — the single ordered list all display surfaces consume. */
export function mergePortfolioMedia(images: string[], videos: string[]): MediaItem[];
```

This is the single source of ordering; the grid, carousel, and lightbox all index
into the returned array so the grid→lightbox index handoff stays consistent.

## Upload / edit path

**Server** — `src/app/api/uploadthing/core.ts`: add route

```ts
portfolioVideo: f({ video: { maxFileSize: '32MB', maxFileCount: 3 } })
  .middleware(requireAuthedUser)
  .onUploadComplete(async ({ file, metadata }) => { /* log */ return { url: file.url }; }),
```

**Client** — generalize the existing uploader rather than fork it:

- `PhotoUploaderDrawer` gains a `kind: 'image' | 'video'` prop (default `'image'`).
  - `kind='video'` → input `accept="video/mp4,video/quicktime"`, endpoint `portfolioVideo`, helper text "MP4 or MOV · ≤20s · ≤32MB · 'Most Compatible' recording plays best".
  - Reuse the PR #168 pre-flight (`partitionSelectedFiles`) for size + count; **add** an async duration check (`readVideoDuration(file) <= 20s`) that filters over-length clips into the existing visible-warning path. Duration read via a throwaway `<video preload="metadata">` + `URL.createObjectURL`.
- `PhotoThumbnailGrid` gains a `kind` (or per-item type) so video items render a muted `<video preload="metadata">` first frame with a ▶ badge overlay instead of `<img>`. dnd id stays the URL (video URLs won't collide with image URLs).
- **Consumers get a second uploader section "Portfolio videos":**
  - `StepPortfolio.tsx` (onboarding) — below the photos uploader.
  - `VendorProfileForm.tsx` (CRM) — below the photos uploader; write path adds `portfolio_videos` in `vendor.service.ts` update and the API schema (`z.array(z.string().url()).max(3).optional()`).

## Public display path

- `VendorProfile.tsx`: read `vendor.portfolio_videos ?? []`; compute `media = mergePortfolioMedia(images, videos)`; `hasGallery = media.length >= 2`; pass `media` to `VendorGallery`.
- `VendorGallery.tsx`: prop becomes `media: MediaItem[]` (was `images: string[]`); passes it to the three children; lightbox index is a position in `media`.
- `PhotoGalleryHero.tsx` / `PhotoCarouselHero.tsx`: for `item.type==='video'`, render a poster tile (muted `<video preload="metadata">` first frame, or `<video>` with a ▶ badge) inside the same `<button onClick={onOpen(i)}>`; images unchanged.
- `GalleryLightbox.tsx`: `images: string[]` → `media: MediaItem[]`; the active slide branches — `<video controls playsInline className="object-contain">` for video (with `onClick`/`onPointerDown` `stopPropagation` so controls don't trigger swipe/close), `<Image>` for image. Keep per-slide remount via `key={index}`.

## Testing

- **Unit:** `mergePortfolioMedia` ordering; video duration/size pre-flight (extend `photo-upload` helpers or a sibling); count cap.
- **Component:** thumbnail ▶ badge renders for video items; lightbox renders `<video>` for a video slide and `<Image>` for an image slide; `stopPropagation` wired.
- **Existing photo tests** must stay green (the `string[]`→`MediaItem[]` prop change).
- E2E: existing gallery specs shouldn't regress; add coverage only if cheap.

## Cost / ops (follow-ups, not this PR)

- UploadThing free tier ≈ 2GB total; uploaded video fills it fast at real adoption. **Paid tier or migration to R2/Supabase Storage is the known next step.** Track after the pilot shows real usage.
- Tight caps are the only cost lever in this PR.

## Rollout

1. Migration 00078 applied dev (Claude) → prod (user).
2. Ship behind normal PR flow (full CI green incl. e2e).
3. Watch: do vendors upload clips? Do they play on desktop (HEVC signal)? → informs transcoding + storage-tier decisions.

## File-by-file summary

| File                                                                                                     | Change                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `supabase/migrations/00078_vendor_portfolio_videos.sql`                                                  | new column                                  |
| `src/types/database.types.ts`                                                                            | +`portfolio_videos` in 3 blocks             |
| `src/lib/portfolio-media.ts`                                                                             | new merge helper + types                    |
| `src/lib/photo-upload.ts`                                                                                | + video duration pre-flight helper          |
| `src/app/api/uploadthing/core.ts`                                                                        | + `portfolioVideo` route                    |
| `src/components/ui/PhotoUploaderDrawer.tsx`                                                              | + `kind` prop, duration check, video accept |
| `src/components/ui/PhotoThumbnailGrid.tsx`                                                               | render `<video>`+▶ for video items          |
| `src/components/onboarding/StepPortfolio.tsx`                                                            | + video uploader section                    |
| `src/components/forms/VendorProfileForm.tsx`                                                             | + video uploader section                    |
| `src/services/vendor.service.ts` + `api/vendor-profile/route.ts`                                         | persist `portfolio_videos` (max 3)          |
| `src/components/marketplace/vendor-profile/VendorProfile.tsx`                                            | read videos, merge, gate                    |
| `.../VendorGallery.tsx` `.../PhotoGalleryHero.tsx` `.../PhotoCarouselHero.tsx` `.../GalleryLightbox.tsx` | consume `MediaItem[]`, render video         |
