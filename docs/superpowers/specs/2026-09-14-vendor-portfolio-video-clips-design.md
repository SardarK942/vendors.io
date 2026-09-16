# Vendor Portfolio Video Clips — Design

**Date:** 2026-09-14 (rev 2026-09-15: switched video backend to Cloudflare Stream)
**Status:** Approved for planning
**Author:** Claude (with Sardar)

## Overview

Let vendors upload short video clips into their portfolio, shown **inline mixed
with photos** in the profile gallery. **Hybrid media architecture:** photos stay on
UploadThing (+ `next/image`); **video goes through Cloudflare Stream**, which
transcodes every upload to a universal adaptive format that plays in all browsers.

Follows PR #168 (photo upload hardening).

## Why Cloudflare Stream (the decision trail)

The reliability bar — "don't ship something that's unpredictably broken for a chunk
of users" — drove this. Self-hosting on UploadThing was viable for storage (paid
Pro, 100GB), but **no file host transcodes**, so raw iPhone **HEVC/.mov** clips
would fail to play in Firefox and some Windows Chrome — an un-fixable minority gap.
Cloudflare Stream **transcodes every clip** (HEVC included) to universal MP4/HLS on
its CDN, accepts large files, adapts quality to the viewer, and supplies poster
thumbnails for free. It removes the format, size, and storage-cost anxieties at once.

**Hybrid, not migration.** Photos stay on UploadThing — they already get
optimization from `next/image`, so moving the working photo pipeline (incl.
thousands of scraped listing images) would buy little. Only video routes to Stream.

## Goals

- Vendors upload short clips from onboarding **and** the CRM profile editor; clips reliably play for essentially all viewers.
- Clips appear inline in the gallery grid/carousel with a ▶ badge; tapping opens the existing lightbox, which plays the clip.

## Non-goals

- Migrating photos off UploadThing.
- tus resumable uploads (basic direct POST covers ≤60s clips; tus is a documented fast-follow if large-4K or flaky-connection failures appear).
- In-app trimming/editing; captions; multiple qualities beyond Stream's automatic ABR.

## Locked decisions

| Decision      | Choice                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Video hosting | **Cloudflare Stream** (direct creator upload); photos stay on UploadThing                        |
| Storage model | New `portfolio_videos TEXT[]` on `vendor_profiles`, storing **Stream video UIDs**                |
| Display order | Photos first, clips after                                                                        |
| Caps          | ≤60s (Stream-enforced via `maxDurationSeconds`), ≤200MB (basic-POST ceiling), max 3 clips/vendor |
| Player        | `@cloudflare/stream-react` `<Stream>` (HLS) in the lightbox; Stream thumbnail as grid poster     |
| Transcoding   | Handled by Stream — universal playback, no HEVC gap                                              |
| Cost          | ~$5–15/mo ($5/1000 min stored + $1/1000 min delivered; encoding free)                            |

## Architecture

```
Vendor browser                Our Next.js server           Cloudflare Stream
  |  request upload URL  ---->  POST /api/stream/direct-upload
  |                             (auth vendor; calls CF API) ----> create direct_upload
  |  <---- { uploadURL, uid } <----------------------------------  { uploadURL, uid }
  |  POST file bytes  --------------------------------------------> (upload)
  |                             poll GET /api/stream/status/[uid] -> video details
  |                             (until readyToStream)
  |  persist uid to portfolio_videos (via existing profile save path)
Public profile: <Stream> player + thumbnail by uid
```

## Data model

```sql
-- supabase/migrations/00078_vendor_portfolio_videos.sql
ALTER TABLE vendor_profiles
  ADD COLUMN portfolio_videos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```

- Stores **Cloudflare Stream video UIDs** (not URLs) — URLs/thumbnails are derived from the UID + the account's Stream customer subdomain.
- Hand-patch `src/types/database.types.ts` (Row/Insert/Update), mirroring `portfolio_images` (types-regen-pending policy).
- Migration: dev by Claude via psql; **prod by user** (migration-apply policy).

## Environment / secrets

Server-only (never `NEXT_PUBLIC_`):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN` (scoped to Stream:Edit)
- `CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN` (the `customer-<code>` used to build playback/thumbnail URLs; confirm exact value from dashboard/API during impl)

Added to `.env.local` (dev) + Vercel (prod). Token is sensitive — see [[secrets_rotation_pending_2026_05_21]] discipline; keep server-only.

## Upload / edit path

**Server endpoints** (`src/app/api/stream/`):

- `POST /direct-upload` — auth the vendor (reuse the UploadThing-style Supabase check), call `POST https://api.cloudflare.com/client/v4/accounts/{id}/stream/direct_upload` with `{ maxDurationSeconds: 60 }`, return `{ uploadURL, uid }`.
- `GET /status/[uid]` — proxy Cloudflare video-details, return `{ readyToStream, thumbnail, ... }` for polling.

**Client — a dedicated `StreamVideoUploader` component** (the UploadThing `PhotoUploaderDrawer` doesn't fit — different backend + async processing). It:

- accepts `video/mp4,video/quicktime`; client pre-checks count (≤3 vs existing) and a soft ≤60s duration read (Stream enforces authoritatively, this is just fast UX feedback);
- gets the upload URL, POSTs the file to Cloudflare, then polls `/status/[uid]` showing a **"Processing…"** state until `readyToStream`;
- on ready, adds the `uid` to the form's video list; surfaces errors visibly (reuse the PR #168 visible-notice pattern);
- helper text: "MP4 or MOV · up to 60s. We convert it so it plays everywhere."
- Reuses `PhotoThumbnailGrid` conventions for the manage/reorder grid, rendering the Stream **thumbnail** + ▶ badge + remove for each `uid`.

**Consumers:** add a "Portfolio videos" section in `StepPortfolio.tsx` (onboarding) and `VendorProfileForm.tsx` (CRM). Persist `portfolio_videos` via `vendor.service.ts` update + API schema (`z.array(z.string()).max(3).optional()`).

## Public display path

- `src/lib/portfolio-media.ts` — `type MediaItem = { type:'image'; url:string } | { type:'video'; uid:string }`; `mergePortfolioMedia(images, videoUids)` → photos first, then clips. Single ordered list all surfaces index into.
- Stream URL helpers (from uid + customer subdomain): `streamThumbnailUrl(uid)` → `…/{uid}/thumbnails/thumbnail.jpg`; playback via `<Stream>` component keyed by uid.
- `VendorProfile.tsx`: read `portfolio_videos`, build `media`, `hasGallery = media.length >= 2`.
- `VendorGallery.tsx` / `PhotoGalleryHero.tsx` / `PhotoCarouselHero.tsx`: consume `MediaItem[]`; video tiles render the Stream thumbnail poster + ▶ badge inside the same `<button onClick={onOpen(i)}>`.
- `GalleryLightbox.tsx`: `images: string[]` → `media: MediaItem[]`; video slide renders `<Stream controls autoplay={false} src={uid} />` (with `stopPropagation` so player controls don't trigger swipe/close); image slide unchanged. Keep per-slide remount via `key={index}`.

## Dependency

Add `@cloudflare/stream-react` (official, small; wraps hls.js). No other player lib.

## Testing

- **Unit:** `mergePortfolioMedia` ordering; Stream URL/thumbnail builders from uid; `/direct-upload` + `/status` route handlers (mock the Cloudflare API — assert auth gate, request shape, response mapping); count cap.
- **Component:** gallery tile renders Stream thumbnail + ▶ for a video item; lightbox renders `<Stream>` for video vs `<Image>` for image; uploader shows Processing → ready transition (mock fetch); existing photo tests stay green through the `string[]`→`MediaItem[]` prop change.
- E2E: don't regress existing gallery specs; add cheap coverage only.

## Cost / ops

- ~$5–15/mo at this scale; storage $5/1000 min, delivery $1/1000 min, encoding free, bandwidth included.
- Stream dashboard shows usage; revisit caps if delivery grows.

## Rollout & decomposition

Two PRs (keeps each reviewable):

1. **PR A — plumbing + data:** migration 00078 (dev→prod), env/secrets, `/api/stream/*` endpoints, `StreamVideoUploader`, wire into onboarding + CRM, persist uids. Vendors can upload; clips stored.
2. **PR B — display:** `portfolio-media` helper + `MediaItem[]` refactor across gallery/carousel/lightbox, thumbnails + `<Stream>` player.

Full CI green (incl. e2e) per merge rule; each PR its own branch off `origin/main`.

## File-by-file summary

| File                                                                                                     | Change                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `supabase/migrations/00078_vendor_portfolio_videos.sql`                                                  | new column (Stream uids)                                                        |
| `src/types/database.types.ts`                                                                            | +`portfolio_videos` in 3 blocks                                                 |
| `src/lib/cloudflare-stream.ts`                                                                           | new — CF API client (create direct upload, get status) + URL/thumbnail builders |
| `src/app/api/stream/direct-upload/route.ts`                                                              | new — auth + mint upload URL                                                    |
| `src/app/api/stream/status/[uid]/route.ts`                                                               | new — readiness poll proxy                                                      |
| `src/components/ui/StreamVideoUploader.tsx`                                                              | new — upload + processing UX + manage grid                                      |
| `src/lib/portfolio-media.ts`                                                                             | new — `MediaItem` + `mergePortfolioMedia`                                       |
| `src/components/onboarding/StepPortfolio.tsx`                                                            | + video uploader section                                                        |
| `src/components/forms/VendorProfileForm.tsx`                                                             | + video uploader section                                                        |
| `src/services/vendor.service.ts` + `api/vendor-profile/route.ts`                                         | persist `portfolio_videos` (max 3)                                              |
| `src/components/marketplace/vendor-profile/VendorProfile.tsx`                                            | read videos, merge, gate                                                        |
| `.../VendorGallery.tsx` `.../PhotoGalleryHero.tsx` `.../PhotoCarouselHero.tsx` `.../GalleryLightbox.tsx` | consume `MediaItem[]`, render `<Stream>` + thumbnails                           |
| `package.json`                                                                                           | +`@cloudflare/stream-react`                                                     |
| `.env.local` / Vercel                                                                                    | +3 Cloudflare env vars                                                          |
