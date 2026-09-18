# Portfolio Video Clips — PR A (Plumbing + Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let vendors upload short video clips through Cloudflare Stream and persist them on the profile — no public display yet (that is PR B).

**Architecture:** Hybrid media. Photos stay on UploadThing. Video: the client asks our server for a one-time Cloudflare Stream direct-upload URL, uploads the file straight to Cloudflare (which transcodes it), polls until `readyToStream`, then persists the returned Stream **video UID** into a new `portfolio_videos TEXT[]` column via the existing profile save path.

**Tech Stack:** Next.js (App Router) route handlers, Supabase (Postgres + auth), Cloudflare Stream REST API, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-vendor-portfolio-video-clips-design.md`

## Global Constraints

- TypeScript strict; **no `any`** (eslint `@typescript-eslint/no-explicit-any` is an error — the pre-commit hook blocks it).
- Cloudflare secrets are **server-only**, never `NEXT_PUBLIC_`: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`. The **customer subdomain is public** (it appears in every playback/thumbnail URL served to viewers), so it is `NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN` (e.g. `customer-abc123`) — this lets the client build thumbnail URLs.
- Migrations: Claude applies **dev** via psql; **user applies prod** (migration-apply policy). Do not run `supabase gen types` — hand-patch `database.types.ts` (types-regen-pending policy).
- Caps (copied from spec): **≤60s** (`maxDurationSeconds: 60`, Stream-enforced), **max 3 clips/vendor**.
- Spend-adjacent routes are rate-limited (`checkRateLimit`), matching existing routes.
- User-facing upload failures must be **visible** (reuse the PR #168 visible-notice pattern), never silent.
- Branch off `origin/main`; commit per task; full CI green before the PR merges.

---

### Task 1: Migration + types for `portfolio_videos`

**Files:**

- Create: `supabase/migrations/00078_vendor_portfolio_videos.sql`
- Modify: `src/types/database.types.ts` (`vendor_profiles` Row ~:255, Insert ~:316, Update ~:375)

**Interfaces:**

- Produces: `vendor_profiles.portfolio_videos: string[]` (Row), `portfolio_videos?: string[]` (Insert/Update) — an array of Cloudflare Stream UIDs.

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/00078_vendor_portfolio_videos.sql
-- Portfolio video clips (Cloudflare Stream). Stores Stream video UIDs, not URLs.
ALTER TABLE vendor_profiles
  ADD COLUMN portfolio_videos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```

- [ ] **Step 2: Apply to dev**

Run (dev connection per `supabase_prod_connection` memo — DEV ref `lquvhjedlzubqusnfaak`):

```bash
psql "$DEV_DATABASE_URL" -f supabase/migrations/00078_vendor_portfolio_videos.sql
psql "$DEV_DATABASE_URL" -c '\d vendor_profiles' | grep portfolio_videos
```

Expected: the `\d` output shows `portfolio_videos | text[]`.

- [ ] **Step 3: Hand-patch database.types.ts**

In the `vendor_profiles` **Row** block add (next to `portfolio_images: string[];`):

```ts
      portfolio_videos: string[];
```

In the **Insert** and **Update** blocks add (next to `portfolio_images?: string[];`):

```ts
      portfolio_videos?: string[];
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00078_vendor_portfolio_videos.sql src/types/database.types.ts
git commit -m "feat(video): add portfolio_videos column + types"
```

---

### Task 2: Cloudflare Stream client lib

**Files:**

- Create: `src/lib/cloudflare-stream.ts`
- Test: `src/__tests__/lib/cloudflare-stream.test.ts`

**Interfaces:**

- Produces:
  - `createDirectUpload(opts?: { maxDurationSeconds?: number }): Promise<{ uploadURL: string; uid: string }>`
  - `getVideoStatus(uid: string): Promise<{ uid: string; readyToStream: boolean }>`
  - `streamThumbnailUrl(uid: string): string`
  - `streamIframeUrl(uid: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/cloudflare-stream.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDirectUpload,
  getVideoStatus,
  streamThumbnailUrl,
  streamIframeUrl,
} from '@/lib/cloudflare-stream';

const OLD_ENV = { ...process.env };
beforeEach(() => {
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
  process.env.CLOUDFLARE_STREAM_API_TOKEN = 'tok-1';
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = 'customer-abc';
});
afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.restoreAllMocks();
});

it('createDirectUpload posts to the CF endpoint and maps the result', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: { uploadURL: 'https://up.cf/abc', uid: 'vid-1' } }),
  });
  vi.stubGlobal('fetch', fetchMock);

  const out = await createDirectUpload({ maxDurationSeconds: 60 });

  expect(out).toEqual({ uploadURL: 'https://up.cf/abc', uid: 'vid-1' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/stream/direct_upload');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer tok-1');
  expect(JSON.parse(init.body)).toEqual({ maxDurationSeconds: 60 });
});

it('createDirectUpload throws on non-ok response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  );
  await expect(createDirectUpload()).rejects.toThrow(/direct_upload failed/i);
});

it('getVideoStatus maps readyToStream', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { readyToStream: true } }) })
  );
  expect(await getVideoStatus('vid-1')).toEqual({ uid: 'vid-1', readyToStream: true });
});

it('builds thumbnail and iframe URLs from the customer subdomain', () => {
  expect(streamThumbnailUrl('vid-1')).toBe(
    'https://customer-abc.cloudflarestream.com/vid-1/thumbnails/thumbnail.jpg'
  );
  expect(streamIframeUrl('vid-1')).toBe('https://customer-abc.cloudflarestream.com/vid-1/iframe');
});

it('throws a clear error when the public subdomain is not configured', () => {
  delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  expect(() => streamThumbnailUrl('vid-1')).toThrow(/Cloudflare Stream subdomain/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/cloudflare-stream.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the lib**

```ts
// src/lib/cloudflare-stream.ts
const CF_API = 'https://api.cloudflare.com/client/v4';

// Secrets — server-only. Throws if called in the browser bundle (env undefined),
// which is correct: createDirectUpload/getVideoStatus run only in route handlers.
function cfServerConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) {
    throw new Error('Cloudflare Stream server env not configured');
  }
  return { accountId, token };
}

// Public — the customer subdomain appears in every viewer-facing media URL, so it
// is NEXT_PUBLIC_ and safe to read in the client (thumbnail/iframe builders).
function cfSubdomain() {
  const subdomain = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  if (!subdomain) throw new Error('Cloudflare Stream subdomain not configured');
  return subdomain;
}

export async function createDirectUpload(opts?: {
  maxDurationSeconds?: number;
}): Promise<{ uploadURL: string; uid: string }> {
  const { accountId, token } = cfServerConfig();
  const res = await fetch(`${CF_API}/accounts/${accountId}/stream/direct_upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxDurationSeconds: opts?.maxDurationSeconds ?? 60 }),
  });
  if (!res.ok) throw new Error(`Cloudflare direct_upload failed: ${res.status}`);
  const json = (await res.json()) as { result: { uploadURL: string; uid: string } };
  return { uploadURL: json.result.uploadURL, uid: json.result.uid };
}

export async function getVideoStatus(
  uid: string
): Promise<{ uid: string; readyToStream: boolean }> {
  const { accountId, token } = cfServerConfig();
  const res = await fetch(`${CF_API}/accounts/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cloudflare video status failed: ${res.status}`);
  const json = (await res.json()) as { result?: { readyToStream?: boolean } };
  return { uid, readyToStream: Boolean(json.result?.readyToStream) };
}

export function streamThumbnailUrl(uid: string): string {
  return `https://${cfSubdomain()}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
}

export function streamIframeUrl(uid: string): string {
  return `https://${cfSubdomain()}.cloudflarestream.com/${uid}/iframe`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/cloudflare-stream.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloudflare-stream.ts src/__tests__/lib/cloudflare-stream.test.ts
git commit -m "feat(video): cloudflare stream client (direct upload, status, url builders)"
```

---

### Task 3: `POST /api/stream/direct-upload`

**Files:**

- Create: `src/app/api/stream/direct-upload/route.ts`
- Test: `src/__tests__/api/stream-direct-upload.test.ts`

**Interfaces:**

- Consumes: `createDirectUpload` (Task 2), `createServerSupabaseClient`, `checkRateLimit(request, key, {limit, window}, userId)`.
- Produces: `POST` returns `{ uploadURL, uid }` (200) / `{ error }` (401, 429, 502).

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/api/stream-direct-upload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/cloudflare-stream', () => ({ createDirectUpload: vi.fn() }));

import { POST } from '@/app/api/stream/direct-upload/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createDirectUpload } from '@/lib/cloudflare-stream';

const mockedClient = vi.mocked(createServerSupabaseClient);
const mockedRl = vi.mocked(checkRateLimit);
const mockedCreate = vi.mocked(createDirectUpload);

function client(user: { id: string } | null) {
  return { auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) } };
}
function req() {
  return new NextRequest('http://localhost/api/stream/direct-upload', { method: 'POST' });
}

beforeEach(() => vi.clearAllMocks());

it('401 when not signed in', async () => {
  mockedClient.mockResolvedValue(client(null) as never);
  const res = await POST(req());
  expect(res.status).toBe(401);
});

it('429 when rate limited', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedRl.mockResolvedValue({ ok: false, message: 'slow down' } as never);
  const res = await POST(req());
  expect(res.status).toBe(429);
});

it('200 returns uploadURL + uid on happy path', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedRl.mockResolvedValue({ ok: true } as never);
  mockedCreate.mockResolvedValue({ uploadURL: 'https://up.cf/x', uid: 'vid-9' });
  const res = await POST(req());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ uploadURL: 'https://up.cf/x', uid: 'vid-9' });
  expect(mockedCreate).toHaveBeenCalledWith({ maxDurationSeconds: 60 });
});

it('502 when Cloudflare fails', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedRl.mockResolvedValue({ ok: true } as never);
  mockedCreate.mockRejectedValue(new Error('cf down'));
  const res = await POST(req());
  expect(res.status).toBe(502);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/stream-direct-upload.test.ts`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/stream/direct-upload/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createDirectUpload } from '@/lib/cloudflare-stream';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gate = await checkRateLimit(
    req,
    'stream:direct-upload',
    { limit: 20, window: '10 m' },
    user.id
  );
  if (!gate.ok) return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });

  try {
    const { uploadURL, uid } = await createDirectUpload({ maxDurationSeconds: 60 });
    return NextResponse.json({ uploadURL, uid });
  } catch {
    return NextResponse.json({ error: 'Could not start upload' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/stream-direct-upload.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stream/direct-upload/route.ts src/__tests__/api/stream-direct-upload.test.ts
git commit -m "feat(video): POST /api/stream/direct-upload (auth + rate-limit + mint url)"
```

---

### Task 4: `GET /api/stream/status/[uid]`

**Files:**

- Create: `src/app/api/stream/status/[uid]/route.ts`
- Test: `src/__tests__/api/stream-status.test.ts`

**Interfaces:**

- Consumes: `getVideoStatus` (Task 2), `createServerSupabaseClient`.
- Produces: `GET(req, { params: { uid } })` returns `{ uid, readyToStream }` (200) / `{ error }` (401).

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/api/stream-status.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/cloudflare-stream', () => ({ getVideoStatus: vi.fn() }));

import { GET } from '@/app/api/stream/status/[uid]/route';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVideoStatus } from '@/lib/cloudflare-stream';

const mockedClient = vi.mocked(createServerSupabaseClient);
const mockedStatus = vi.mocked(getVideoStatus);

function client(user: { id: string } | null) {
  return { auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) } };
}
function ctx(uid: string) {
  return { params: Promise.resolve({ uid }) };
}
function req() {
  return new NextRequest('http://localhost/api/stream/status/vid-1');
}

beforeEach(() => vi.clearAllMocks());

it('401 when not signed in', async () => {
  mockedClient.mockResolvedValue(client(null) as never);
  const res = await GET(req(), ctx('vid-1'));
  expect(res.status).toBe(401);
});

it('200 returns readiness', async () => {
  mockedClient.mockResolvedValue(client({ id: 'u1' }) as never);
  mockedStatus.mockResolvedValue({ uid: 'vid-1', readyToStream: true });
  const res = await GET(req(), ctx('vid-1'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ uid: 'vid-1', readyToStream: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/api/stream-status.test.ts`
Expected: FAIL (route not found).

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/stream/status/[uid]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVideoStatus } from '@/lib/cloudflare-stream';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { uid } = await ctx.params;
  try {
    const status = await getVideoStatus(uid);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: 'Status unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/stream-status.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stream/status/ src/__tests__/api/stream-status.test.ts
git commit -m "feat(video): GET /api/stream/status/[uid] readiness poll"
```

---

### Task 5: Persist `portfolio_videos` (service + API schema)

**Files:**

- Modify: `src/services/vendor.service.ts` (update block ~:203-206; the input type it maps from)
- Modify: `src/app/api/vendor-profile/route.ts` (zod schema ~:24)
- Test: `src/__tests__/api/vendor-profile-videos.test.ts`

**Interfaces:**

- Consumes: `vendor_profiles.portfolio_videos` (Task 1).
- Produces: profile update persists `portfolio_videos: string[]` (≤3); API rejects >3.

- [ ] **Step 1: Write the failing test (schema cap)**

```ts
// src/__tests__/api/vendor-profile-videos.test.ts
import { describe, it, expect } from 'vitest';
import { vendorProfileUpdateSchema } from '@/app/api/vendor-profile/route';

it('accepts up to 3 video uids', () => {
  const r = vendorProfileUpdateSchema.safeParse({ portfolio_videos: ['a', 'b', 'c'] });
  expect(r.success).toBe(true);
});

it('rejects more than 3 video uids', () => {
  const r = vendorProfileUpdateSchema.safeParse({ portfolio_videos: ['a', 'b', 'c', 'd'] });
  expect(r.success).toBe(false);
});
```

> Note: if the schema is not currently exported, export it in Step 3 so it is unit-testable.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/vendor-profile-videos.test.ts`
Expected: FAIL (import/undefined or schema missing the field).

- [ ] **Step 3: Add the field + export the schema**

In `src/app/api/vendor-profile/route.ts`, ensure the schema is exported (rename the local const if needed to `export const vendorProfileUpdateSchema = z.object({ ... })`) and add next to `portfolio_images`:

```ts
  portfolio_videos: z.array(z.string()).max(3).optional(),
```

In `src/services/vendor.service.ts`, add to the `.update({ ... })` object (next to `portfolio_images`):

```ts
      portfolio_videos: input.portfolioVideos,
```

and add `portfolioVideos?: string[]` to that function's input type, mapping it wherever the caller builds the input from the request body (`portfolio_videos` → `portfolioVideos`).

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/__tests__/api/vendor-profile-videos.test.ts && npx tsc --noEmit`
Expected: PASS + clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/vendor-profile/route.ts src/services/vendor.service.ts src/__tests__/api/vendor-profile-videos.test.ts
git commit -m "feat(video): persist portfolio_videos (max 3) via profile update"
```

---

### Task 6: `StreamVideoUploader` component

**Files:**

- Create: `src/components/ui/StreamVideoUploader.tsx`
- Test: `src/__tests__/components/ui/StreamVideoUploader.test.tsx`

**Interfaces:**

- Consumes: `POST /api/stream/direct-upload`, `GET /api/stream/status/[uid]`, `streamThumbnailUrl` (Task 2).
- Produces: `<StreamVideoUploader value={string[]} onChange={(uids: string[]) => void} maxClips={number} />` — `value` is the current uid list; calls `onChange` with the new list when a clip finishes processing; caps selection at `maxClips`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/ui/StreamVideoUploader.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StreamVideoUploader } from '@/components/ui/StreamVideoUploader';

function videoFile(name: string, sizeMb = 5): File {
  const f = new File([], name, { type: 'video/mp4' });
  Object.defineProperty(f, 'size', { value: sizeMb * 1024 * 1024 });
  return f;
}

beforeEach(() => {
  // direct-upload -> uploadURL+uid ; PUT/POST upload -> ok ; status -> ready
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/stream/direct-upload')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ uploadURL: 'https://up.cf/x', uid: 'vid-1' }),
      });
    }
    if (url === 'https://up.cf/x') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/api/stream/status/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ uid: 'vid-1', readyToStream: true }),
      });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.restoreAllMocks());

it('uploads a clip and calls onChange with the new uid once ready', async () => {
  const onChange = vi.fn();
  render(<StreamVideoUploader value={[]} onChange={onChange} maxClips={3} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [videoFile('clip.mp4')] } });

  await waitFor(() => expect(onChange).toHaveBeenCalledWith(['vid-1']));
});

it('blocks selection past maxClips with a visible notice and no upload', async () => {
  const onChange = vi.fn();
  render(<StreamVideoUploader value={['a', 'b', 'c']} onChange={onChange} maxClips={3} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [videoFile('extra.mp4')] } });

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/ui/StreamVideoUploader.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 3: Implement the component**

```tsx
// src/components/ui/StreamVideoUploader.tsx
'use client';
import * as React from 'react';
import { streamThumbnailUrl } from '@/lib/cloudflare-stream';

interface Props {
  value: string[];
  onChange: (uids: string[]) => void;
  maxClips: number;
}

export function StreamVideoUploader({ value, onChange, maxClips }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (value.length >= maxClips) {
      setError(`You can add up to ${maxClips} clips.`);
      return;
    }
    setBusy(true);
    try {
      const initRes = await fetch('/api/stream/direct-upload', { method: 'POST' });
      if (!initRes.ok) throw new Error('init');
      const { uploadURL, uid } = (await initRes.json()) as { uploadURL: string; uid: string };

      const form = new FormData();
      form.append('file', file);
      const upRes = await fetch(uploadURL, { method: 'POST', body: form });
      if (!upRes.ok) throw new Error('upload');

      // Poll until Cloudflare has transcoded the clip.
      for (let i = 0; i < 30; i++) {
        const s = await fetch(`/api/stream/status/${uid}`);
        if (s.ok) {
          const { readyToStream } = (await s.json()) as { readyToStream: boolean };
          if (readyToStream) {
            onChange([...value, uid]);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('processing-timeout');
    } catch {
      setError('That clip couldn’t be uploaded. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || value.length >= maxClips}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink bg-cream px-3 py-2 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
      >
        {busy ? 'Processing…' : `Upload video (${value.length}/${maxClips})`}
      </button>
      <p className="mt-1 text-xs text-ink/50">
        MP4 or MOV · up to 60s. We convert it so it plays everywhere.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {value.map((uid) => (
            <div key={uid} className="relative aspect-video overflow-hidden rounded-md bg-ink/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- CF thumbnail, fixed box */}
              <img src={streamThumbnailUrl(uid)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove clip"
                onClick={() => onChange(value.filter((u) => u !== uid))}
                className="absolute right-1 top-1 rounded-full bg-ink/70 px-1.5 text-xs text-cream"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-hot-pink/10 px-3 py-2 text-xs text-hot-pink">
          {error}
        </p>
      )}
    </div>
  );
}
```

> Note: `streamThumbnailUrl` reads `NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN`, which Next.js inlines into the client bundle, so it works in the browser (the subdomain is public — it's in every viewer-facing media URL).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/ui/StreamVideoUploader.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/StreamVideoUploader.tsx src/__tests__/components/ui/StreamVideoUploader.test.tsx
git commit -m "feat(video): StreamVideoUploader (direct upload + processing + manage grid)"
```

---

### Task 7: Wire the uploader into onboarding + CRM

**Files:**

- Modify: `src/components/onboarding/StepPortfolio.tsx` (below the photos `PhotoUploaderDrawer` ~:78-89)
- Modify: `src/components/forms/VendorProfileForm.tsx` (below the photos uploader ~:293; add `portfolioVideos` to the form state + submit payload)

**Interfaces:**

- Consumes: `StreamVideoUploader` (Task 6); `portfolio_videos` persistence (Task 5).

- [ ] **Step 1: Add the video section to `StepPortfolio.tsx`**

Add a `videos` state seeded from the profile (`vendor.portfolio_videos ?? []`), render below the photo uploader:

```tsx
<div className="mt-6">
  <p className="mb-2 text-sm font-medium text-ink">Portfolio videos (optional)</p>
  <StreamVideoUploader value={videos} onChange={setVideos} maxClips={3} />
</div>
```

Include `portfolio_videos: videos` in the PATCH body sent to `/api/vendor-profile/setup/portfolio` (extend `portfolioSchema` in `src/lib/onboarding/validation.ts` with `portfolioVideos: z.array(z.string()).max(3).optional()` and persist it in `src/app/api/vendor-profile/setup/[step]/route.ts` alongside `portfolio_images`).

- [ ] **Step 2: Add the video section to `VendorProfileForm.tsx`**

Add `portfolioVideos` to the form state (seed from `initialData.portfolio_videos ?? []`), render `<StreamVideoUploader value={portfolioVideos} onChange={setPortfolioVideos} maxClips={3} />` below the photos uploader, and include `portfolio_videos: portfolioVideos` in the submit payload to `/api/vendor-profile`.

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck; all tests green (existing photo/onboarding tests unaffected).

- [ ] **Step 4: Manual smoke (dev, with real Cloudflare creds)**

With `.env.local` Cloudflare vars set: run `npm run dev`, open the onboarding portfolio step, upload a short .mp4, confirm it shows "Processing…" then a thumbnail, save, reload, confirm the clip persists. Confirm `streamThumbnailUrl` works in the browser (see Task 6 note); if it throws, pass the thumbnail URL from the server and record for PR B.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/StepPortfolio.tsx src/components/forms/VendorProfileForm.tsx src/lib/onboarding/validation.ts src/app/api/vendor-profile/setup/[step]/route.ts
git commit -m "feat(video): add portfolio video section to onboarding + CRM"
```

---

## Prerequisite (user action, before Task 7 manual smoke)

Provide Cloudflare Stream credentials for `.env.local` (dev) and Vercel (prod): `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` (Stream:Edit), and `NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN` (the public `customer-<code>`). Tasks 1-6 and their tests do not need real credentials (tests mock/stub).

## PR A definition of done

- Migration applied dev (Claude) + prod (user); types patched.
- Cloudflare lib + both routes + uploader + persistence, all with passing tests.
- Vendors can upload clips in onboarding + CRM; uids persist to `portfolio_videos`.
- Public display is intentionally NOT included — that is PR B.
- Full CI green; PR opened off `origin/main`.
