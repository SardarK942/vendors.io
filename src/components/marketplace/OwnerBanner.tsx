'use client';

import Link from 'next/link';

interface OwnerBannerProps {
  onPreview: () => void;
  editHref: string;
}

export function OwnerBanner({ onPreview, editHref }: OwnerBannerProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink/15 bg-cream px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-hot-pink" aria-hidden />
        <p className="text-sm text-ink">This is how customers see your profile.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPreview}
          className="rounded-md border border-ink px-3 py-1.5 text-sm font-medium text-ink hover-pink-border"
        >
          View as Customer
        </button>
        <Link
          href={editHref}
          className="duration-[180ms] rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream transition-all ease-out hover:-translate-y-px hover:bg-hot-pink hover:shadow-pink motion-reduce:hover:translate-y-0"
        >
          Edit Profile
        </Link>
      </div>
    </div>
  );
}
