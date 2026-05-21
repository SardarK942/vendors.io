'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UploadButton } from '@/lib/uploadthing';
import { portfolioSchema } from '@/lib/onboarding/validation';

interface Props {
  initial: { portfolioImages: string[] };
  profileId: string;
  mode: 'first' | 'next';
}

export function StepPortfolio({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const [images, setImages] = useState<string[]>(initial.portfolioImages);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function onNext() {
    const parsed = portfolioSchema.safeParse({ portfolioImages: images });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/vendor-profile/setup/portfolio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, profile_id: profileId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Save failed' }));
      setError(json.error ?? 'Save failed');
      return;
    }
    const nextParam = mode === 'next' ? '?next=true' : '';
    router.push(`/dashboard/profile/setup/payment-mode${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Show your work</h1>
        <p className="text-sm text-muted-foreground">Step 4 of 5</p>
      </div>

      {images.length > 0 && images.length < 3 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Vendors with 3+ photos get 2&times; more clicks &mdash; add more if you have them.
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {images.map((url) => (
            <div key={url} className="relative">
              <Image
                src={url}
                alt="Portfolio image"
                width={96}
                height={96}
                className="h-24 w-24 rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow hover:bg-destructive/90"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <UploadButton
          endpoint="portfolioImage"
          onClientUploadComplete={(res) => {
            if (res && res.length > 0) {
              const newUrls = res.map((r) => r.url);
              setImages((prev) => [...prev, ...newUrls]);
              setError(null);
            }
          }}
          onUploadError={(err) => {
            setError(err.message ?? 'Upload failed');
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Upload up to 10 images (max 4 MB each). At least 1 required.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting || images.length === 0}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
