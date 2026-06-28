'use client';
import Link from 'next/link';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

interface Props {
  matches: ScrapedVendorMatch[];
}

export function ScrapedVendorMatchPrompt({ matches }: Props) {
  const top = matches[0];
  if (!top) return null;

  return (
    <div className="my-4 rounded-lg border bg-muted/30 p-4">
      <h3 className="mb-2 text-lg font-semibold">
        We already have a listing for your business on Baazar.
      </h3>
      <div className="mb-4 rounded-md border bg-background p-3">
        <p className="font-medium" translate="no">
          {top.business_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {top.category ?? 'category unknown'} · {top.city ?? 'unknown city'}
          {top.instagram_handle && (
            <>
              {' '}
              · <span translate="no">@{top.instagram_handle}</span>
            </>
          )}
        </p>
      </div>
      <p className="mb-3 text-sm">To verify it’s yours and take ownership:</p>
      <ol className="ml-5 list-decimal text-sm">
        <li>Visit your listing</li>
        <li>Click &ldquo;I own this business&rdquo;</li>
        <li>Choose &ldquo;Get help claiming&rdquo;</li>
      </ol>
      <div className="mt-4">
        <Link
          href={`/vendors/${top.slug}`}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:opacity-90"
        >
          Visit my listing
        </Link>
      </div>
    </div>
  );
}
