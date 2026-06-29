'use client';

import Link from 'next/link';

interface OwnerBannerProps {
  onPreview: () => void;
  editHref: string;
}

export function OwnerBanner({ onPreview, editHref }: OwnerBannerProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between bg-cream px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(0,0,0,0.05),0_6px_10px_-10px_rgba(0,0,0,0.10)]">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-hot-pink" aria-hidden />
        <p className="text-sm text-ink">This is how customers see your profile.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPreview}
          className="rounded-md border border-ink px-3 py-1.5 text-sm font-medium text-ink transition-colors hover-pink-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          View as Customer
        </button>
        <Link
          href={editHref}
          className="duration-[180ms] rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream transition-[background-color,box-shadow,transform] ease-out hover:-translate-y-px hover:bg-hot-pink hover:shadow-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream motion-reduce:hover:translate-y-0"
        >
          Edit Profile
        </Link>
      </div>
    </div>
  );
}
