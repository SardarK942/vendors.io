import fs from 'node:fs/promises';
import path from 'node:path';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { scrapedRowSchema, type ScrapedRow } from './lib/schemas';
import { normalizeInstagramHandle, normalizePhone } from './lib/normalize';
import crypto from 'node:crypto';
import { generateScrapedVendorSlug } from './lib/slug';

export interface MergeResult {
  inserted: number;
  updated: number;
  errors: number;
}

export async function mergeRowsToScrapedVendors(rows: ScrapedRow[]): Promise<MergeResult> {
  const supabase = await createServiceRoleClient();
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    const normalized = {
      ...row,
      instagram_handle: normalizeInstagramHandle(row.instagram_handle ?? null),
      phone: normalizePhone(row.phone ?? null),
    };

    // Try to find existing by source+external_id, then by IG, then by phone
    let existingId: string | null = null;
    if (normalized.source_external_id) {
      const { data } = await supabase
        .from('scraped_vendors')
        .select('id')
        .eq('source', normalized.source)
        .eq('source_external_id', normalized.source_external_id)
        .maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && normalized.instagram_handle) {
      const { data } = await supabase
        .from('scraped_vendors')
        .select('id')
        .eq('instagram_handle', normalized.instagram_handle)
        .maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && normalized.phone) {
      const { data } = await supabase
        .from('scraped_vendors')
        .select('id')
        .eq('phone', normalized.phone)
        .maybeSingle();
      existingId = data?.id ?? null;
    }

    if (existingId) {
      const { error } = await supabase
        .from('scraped_vendors')
        .update({
          ...normalized,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existingId);
      if (error) errors++;
      else updated++;
    } else {
      const newId = crypto.randomUUID();
      const slug = generateScrapedVendorSlug(normalized.business_name, newId);
      const { error } = await supabase.from('scraped_vendors').insert({
        ...normalized,
        id: newId,
        slug,
      });
      if (error) errors++;
      else inserted++;
    }
  }

  return { inserted, updated, errors };
}

async function loadAllDumps(rootDir: string): Promise<ScrapedRow[]> {
  const all: ScrapedRow[] = [];
  const sources = await fs.readdir(rootDir).catch(() => []);
  for (const source of sources) {
    const sourceDir = path.join(rootDir, source);
    const stat = await fs.stat(sourceDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const dates = await fs.readdir(sourceDir);
    for (const date of dates) {
      const filePath = path.join(sourceDir, date, 'rows.json');
      const text = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (!text) continue;
      const data = JSON.parse(text);
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        const parsed = scrapedRowSchema.safeParse(item);
        if (parsed.success) all.push(parsed.data);
      }
    }
  }
  return all;
}

if (require.main === module) {
  (async () => {
    const rows = await loadAllDumps(path.join(process.cwd(), 'data/scraped'));
    console.log(`merge: loaded ${rows.length} rows from disk`);
    const result = await mergeRowsToScrapedVendors(rows);
    console.log(
      `merge: inserted=${result.inserted} updated=${result.updated} errors=${result.errors}`
    );
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
