/**
 * Hourly cron: backfill embeddings for any vendor with embedding IS NULL.
 *
 * Why: parseSearchQuery + semanticSearch only return vendors with non-null
 * embeddings. New scraper/onboarded vendors are otherwise invisible to AI
 * search until someone runs the admin /api/ai/embed endpoint by hand. This
 * cron picks up to 50/hour so eventual coverage is automatic, while the cost
 * stays bounded (~$0.001 per run at text-embedding-3-small pricing).
 *
 * Scheduled via vercel.json crons. Auth via Authorization: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';

export const dynamic = 'force-dynamic';

const BATCH = 50;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!authorized(request)) throw new HttpError(401, 'Unauthorized');

  const supabase = createServiceRoleClient();

  const { data: vendors, error } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, bio, category')
    .is('embedding', null)
    .limit(BATCH);

  if (error) throw new HttpError(500, `Fetch vendors failed: ${error.message}`);
  if (!vendors || vendors.length === 0) {
    return NextResponse.json({ data: { processed: 0, message: 'No vendors need embedding' } });
  }

  // Build the same input shape the admin route uses so embeddings stay consistent.
  const inputs = vendors.map((v) =>
    `${v.business_name ?? ''} - ${v.category ?? ''} - ${v.bio ?? ''}`.trim()
  );

  const embeddings = await generateEmbeddingsBatch(inputs);

  let updated = 0;
  const errors: string[] = [];
  for (let i = 0; i < vendors.length; i++) {
    const { error: updateErr } = await supabase
      .from('vendor_profiles')
      .update({ embedding: JSON.stringify(embeddings[i]) } as Record<string, unknown>)
      .eq('id', vendors[i].id);
    if (updateErr) {
      errors.push(`${vendors[i].id}: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    data: {
      processed: vendors.length,
      updated,
      errors: errors.length,
      errorSamples: errors.slice(0, 3),
    },
  });
}

export const GET = withErrorBoundary(run);
export const POST = withErrorBoundary(run);
