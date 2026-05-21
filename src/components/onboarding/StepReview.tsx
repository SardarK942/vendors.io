'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { VendorCard } from '@/components/marketplace/VendorCard';
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
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishErrorStep, setPublishErrorStep] = useState<string | null>(null);

  async function onPublish() {
    setPublishing(true);
    setPublishError(null);

    // Sub-project I §6: in 'next' mode, also send the Stripe override choice
    // (stashed in sessionStorage by StepPaymentMode).
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
    } else if (field === 'payment_mode') {
      setPublishErrorStep('payment-mode');
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
        <p className="text-sm text-muted-foreground">Step 6 of 6 — check everything looks right before publishing.</p>
      </div>

      {/* Summary cards */}
      <div className="space-y-4">
        {/* Basics */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Basics</h2>
            <Link
              href="/dashboard/profile/setup/basics"
              className="text-xs text-primary underline"
            >
              Edit
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground w-32">Business name</dt>
              <dd>{profile.business_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground w-32">Category</dt>
              <dd>{VENDOR_CATEGORY_LABELS[profile.category] ?? profile.category}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground w-32">Bio</dt>
              <dd className="whitespace-pre-wrap">{profile.bio ?? <span className="text-destructive">Missing</span>}</dd>
            </div>
          </dl>
        </div>

        {/* Location */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between mb-2">
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
              <dt className="font-medium text-muted-foreground w-32">Address</dt>
              <dd>
                {profile.base_address_line_1
                  ? `${profile.base_address_line_1}, ${profile.base_city}, ${profile.base_state} ${profile.base_postal_code}`
                  : <span className="text-destructive">Missing</span>}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground w-32">Address public</dt>
              <dd>{profile.base_address_public ? 'Yes' : 'No (city + state only)'}</dd>
            </div>
          </dl>
        </div>

        {/* Online */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Online presence</h2>
            <Link
              href="/dashboard/profile/setup/online"
              className="text-xs text-primary underline"
            >
              Edit
            </Link>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-muted-foreground w-32">Instagram</dt>
              <dd>
                {profile.instagram_handle
                  ? `@${profile.instagram_handle}`
                  : <span className="text-destructive">Missing</span>}
              </dd>
            </div>
            {profile.website_url && (
              <div className="flex gap-2">
                <dt className="font-medium text-muted-foreground w-32">Website</dt>
                <dd>
                  <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="underline">
                    {profile.website_url}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Portfolio */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between mb-2">
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

        {/* Payment mode */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Payment mode</h3>
            <Link href="/dashboard/profile/setup/payment-mode" className="text-sm text-primary underline">Edit</Link>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {profile.payment_mode === 'cash' ? 'Direct payments — coordinate with each couple yourself.' : 'Through Baazar — couples pay deposit via the platform.'}
          </p>
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <h2 className="font-semibold">Preview</h2>
        <p className="text-xs text-muted-foreground">This is how your listing will appear in the marketplace.</p>
        <div className="max-w-xs">
          <VendorCard vendor={previewVendor} />
        </div>
      </div>

      {/* Publish error */}
      {publishError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p>{publishError}</p>
          {publishErrorStep && (
            <Link
              href={`/dashboard/profile/setup/${publishErrorStep}`}
              className="mt-1 block underline"
            >
              Go to {publishErrorStep} step to fix this
            </Link>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onPublish} disabled={publishing} size="lg">
          {publishing ? 'Publishing…' : 'Publish profile'}
        </Button>
      </div>
    </div>
  );
}
