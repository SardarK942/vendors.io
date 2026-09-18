'use client';
import * as React from 'react';
import { streamThumbnailUrl } from '@/lib/cloudflare-stream';

interface Props {
  value: string[];
  onChange: (uids: string[]) => void;
  maxClips: number;
}

type Stage = 'idle' | 'uploading' | 'processing';

/** POST the file to Cloudflare with real upload progress (fetch has no upload
 *  progress event, so we use XHR just for this leg). */
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('upload'));
    xhr.onerror = () => reject(new Error('upload'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export function StreamVideoUploader({ value, onChange, maxClips }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [stage, setStage] = React.useState<Stage>('idle');
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const busy = stage !== 'idle';

  async function handleFile(file: File) {
    setError(null);
    if (value.length >= maxClips) {
      setError(`You can add up to ${maxClips} clips.`);
      return;
    }
    setStage('uploading');
    setProgress(0);
    try {
      const initRes = await fetch('/api/stream/direct-upload', { method: 'POST' });
      if (!initRes.ok) throw new Error('init');
      const { uploadURL, uid } = (await initRes.json()) as { uploadURL: string; uid: string };

      await uploadWithProgress(uploadURL, file, setProgress);
      setProgress(100);
      setStage('processing');

      // Poll until Cloudflare has transcoded the clip.
      for (let i = 0; i < 60; i++) {
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
      setStage('idle');
      setProgress(0);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || value.length >= maxClips}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink bg-cream px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5 disabled:opacity-50"
      >
        Upload video ({value.length}/{maxClips})
      </button>
      <p className="mt-1 text-xs text-ink/50">up to 60s</p>

      {busy && (
        <div className="mt-3 max-w-xs" role="status" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            {stage === 'uploading' ? (
              <>
                <span className="font-medium text-ink">Uploading</span>
                <span className="tabular-nums text-ink/60">{progress}%</span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <span
                  aria-hidden="true"
                  className="size-3 animate-spin rounded-full border-2 border-ink/20 border-t-hot-pink motion-reduce:animate-none"
                />
                Transcoding your clip
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div
              className={
                stage === 'uploading'
                  ? 'ease-[cubic-bezier(0.22,1,0.36,1)] h-full origin-left rounded-full bg-hot-pink transition-transform duration-300'
                  : 'h-full origin-left rounded-full bg-hot-pink motion-safe:animate-pulse'
              }
              style={
                stage === 'uploading'
                  ? { transform: `scaleX(${Math.max(progress, 3) / 100})` }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {value.map((uid) => (
            <div
              key={uid}
              className="group relative aspect-video overflow-hidden rounded-md bg-ink/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- CF thumbnail, fixed box */}
              <img src={streamThumbnailUrl(uid)} alt="" className="h-full w-full object-cover" />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/0 transition-colors group-hover:bg-ink/25"
              >
                <span className="ease-[cubic-bezier(0.22,1,0.36,1)] flex size-8 translate-y-1 items-center justify-center rounded-full bg-cream/90 text-ink opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5 translate-x-px">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
              <button
                type="button"
                aria-label="Remove clip"
                onClick={() => onChange(value.filter((u) => u !== uid))}
                className="absolute right-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-ink/70 text-base leading-none text-cream transition-colors hover:bg-ink"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 max-w-xs rounded-md bg-hot-pink/10 px-3 py-2 text-xs text-hot-pink"
        >
          {error}
        </p>
      )}
    </div>
  );
}
