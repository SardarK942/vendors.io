'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormErrors } from '@/hooks/useFormErrors';
import Link from 'next/link';
import Image from 'next/image';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { VendorCard } from '@/components/marketplace/VendorCard';
import { VendorProfile } from '@/components/marketplace/VendorProfile';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface Props {
  profile: VendorRow;
  profileId: string;
  mode: 'first' | 'next';
}

export function StepReview({ profile, profileId, mode }: Props) {
  const router = useRouter();
  const { total } = useFormErrors();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishErrorStep, setPublishErrorStep] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function onPublish() {
    setPublishing(true);
    setPublishError(null);

    // Sub-project I §6: in 'next' mode, also send the Stripe override choice
    // (stashed in sessionStorage by a prior wizard step).
    let stripeMode: 'reuse' | 'new' | null = null;
    if (mode === 'next' && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`wizard:stripe_mode:${profileId}`);
      if (stored === 'reuse' || stored === 'new') stripeMode = stored;
    }

    const res = await fetch('/api/vendor-profile/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, mode, stripe_mode: stripeMode }),
    });
    setPublishing(false);
    if (res.ok) {
      // Clean up the sessionStorage stash now that the publish has read it.
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`wizard:stripe_mode:${profileId}`);
      }
      router.push('/dashboard/profile/packages?just_onboarded=1');
      return;
    }
    const json = await res.json().catch(() => ({ error: 'Publish failed' }));
    setPublishError(json.error ?? json.message ?? 'Publish failed');
    // Map field name to step
    const field: string = json.field ?? '';
    if (field.startsWith('business_name') || field === 'category' || field === 'bio') {
      setPublishErrorStep('basics');
    } else if (field.startsWith('base_')) {
      setPublishErrorStep('location');
    } else if (field === 'instagram_handle' || field === 'website_url') {
      setPublishErrorStep('online');
    } else if (field === 'portfolio_images') {
      setPublishErrorStep('portfolio');
    } else {
      setPublishErrorStep(null);
    }
  }

  // Build a preview-compatible vendor object for VendorCard
  const previewVendor: VendorRow & { vendor_packages_price_band?: null } = {
    ...profile,
    vendor_packages_price_band: null,
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Review your profile</h1>
        <p className="text-sm text-muted-foreground">
          Step 6 of 6 — check everything looks right before publishing.
        </p>
      </div>

      {/* Summary cards */}
      <div className="space-y-4">
        {/* Basics */}
        <div className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Basics</h2>
            <Link href="/dashboard/profile/setup/basics" className="text-xs text-primary underline">
              Edit
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 font-medium text-muted-foreground">Business name</dt>
              <dd translate="no">{profile.business_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-medium text-muted-foreground">Category</dt>
              <dd>{VENDOR_CATEGORY_LABELS[profile.category] ?? profile.category}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-medium text-muted-foreground">Bio</dt>
              <dd className="whitespace-pre-wrap">
                {profile.bio ?? <span className="text-destructive">Missing</span>}
              </dd>
            </div>
          </dl>
        </div>

        {/* Location */}
        <div className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Location</h2>
            <Link
              href="/dashboard/profile/setup/location"
              className="text-xs text-primary underline"
            >
              Edit
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 font-medium text-muted-foreground">Address</dt>
              <dd>
                {profile.base_address_line_1 ? (
                  `${profile.base_address_line_1}, ${profile.base_city}, ${profile.base_state} ${profile.base_postal_code}`
                ) : (
                  <span className="text-destructive">Missing</span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 font-medium text-muted-foreground">Address public</dt>
              <dd>{profile.base_address_public ? 'Yes' : 'No (city + state only)'}</dd>
            </div>
          </dl>
        </div>

        {/* Online */}
        <div className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Online presence</h2>
            <Link href="/dashboard/profile/setup/online" className="text-xs text-primary underline">
              Edit
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 font-medium text-muted-foreground">Instagram</dt>
              <dd>
                {profile.instagram_handle ? (
                  <span translate="no">@{profile.instagram_handle}</span>
                ) : (
                  <span className="text-destructive">Missing</span>
                )}
              </dd>
            </div>
            {profile.website_url && (
              <div className="flex gap-2">
                <dt className="w-32 font-medium text-muted-foreground">Website</dt>
                <dd>
                  <a
                    href={profile.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {profile.website_url}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Portfolio */}
        <div className="rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Portfolio</h2>
            <Link
              href="/dashboard/profile/setup/portfolio"
              className="text-xs text-primary underline"
            >
              Edit
            </Link>
          </div>
          {profile.portfolio_images.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.portfolio_images.map((url) => (
                <Image
                  key={url}
                  src={url}
                  alt="Portfolio"
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-md object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-destructive">No images uploaded</p>
          )}
        </div>
      </div>

      {/* Fee disclosure */}
      <p className="text-sm text-muted-foreground">
        Baazar takes a 5% deposit at booking. Everything else you collect directly from the
        customer.
      </p>

      {/* Live preview */}
      <div className="space-y-2">
        <h2 className="font-semibold">Preview</h2>
        <p className="text-xs text-muted-foreground">
          This is how your listing will appear in the marketplace. Click to see the full profile.
        </p>
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="block w-full max-w-xs overflow-hidden rounded-lg text-left ring-1 ring-ink/10 transition hover:ring-ink/30"
            >
              <VendorCard vendor={previewVendor} />
            </button>
          </DialogTrigger>
          <DialogContent className="m-0 h-[100dvh] w-screen max-w-none rounded-none border-0 p-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
            {/* Top banner */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-cream px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-ink">
                <span className="size-2 rounded-full bg-hot-pink" />
                Preview — not yet published
              </p>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="flex size-10 items-center justify-center rounded-md text-ink hover:bg-ink/5"
              >
                <X className="size-5" />
              </button>
            </div>
            {/* The actual preview */}
            <div className="h-[calc(100vh-49px)] overflow-y-auto">
              <VendorProfile vendor={previewVendor} showBookingButton={false} />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Publish error */}
      {total >= 2 && (
        <p className="text-sm font-medium text-hot-pink" role="status" aria-live="polite">
          {total} fields need attention
        </p>
      )}

      {publishError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <p>{publishError}</p>
          {publishErrorStep && (
            <Link
              href={`/dashboard/profile/setup/${publishErrorStep}`}
              className="mt-1 block underline"
            >
              Edit step {publishErrorStep} to fix this
            </Link>
          )}
        </div>
      )}

      <div className="rounded-md border border-ink/15 bg-cream/60 p-3">
        <p className="text-xs text-ink/80">
          By publishing your profile, you agree to Baazar’s terms. Customers pay a 5% deposit
          through Baazar at booking — that’s our platform fee. You collect the 95% balance directly
          from them. If you cancel a confirmed booking, the customer’s deposit is refunded in full.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={onPublish} disabled={publishing} size="lg">
          {publishing ? 'Publishing…' : 'Publish Profile'}
        </Button>
      </div>
    </div>
  );
}
