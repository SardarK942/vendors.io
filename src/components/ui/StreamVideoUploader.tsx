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
