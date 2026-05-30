import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapedRowSchema, type ScrapedRow } from '../lib/schemas';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';

const HAND_CURATED_DIR = path.join(process.cwd(), 'data/scraped/hand-curated');
const OUTPUT_DIR_ROOT = path.join(process.cwd(), 'data/scraped/hand-curated-merged');

export async function runHandCuratedSource(): Promise<void> {
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_DIR_ROOT, runDate);
  const manifest = emptyManifest('hand_curated', runDate);

  const files = (await fs.readdir(HAND_CURATED_DIR)).filter((f) => f.endsWith('.json'));
  const rows: ScrapedRow[] = [];

  for (const file of files) {
    manifest.queries_executed += 1;
    const filePath = path.join(HAND_CURATED_DIR, file);
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        manifest.errors.push({
          context: file,
          code: 'NOT_ARRAY',
          message: 'file root must be an array',
          ts: new Date().toISOString(),
        });
        continue;
      }
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const parsed = scrapedRowSchema.safeParse(item);
        if (!parsed.success) {
          manifest.errors.push({
            context: `${file}[${i}]`,
            code: 'INVALID_SCHEMA',
            message: parsed.error.message,
            ts: new Date().toISOString(),
          });
          continue;
        }
        rows.push(parsed.data);
      }
    } catch (e) {
      manifest.errors.push({
        context: file,
        code: 'READ_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned = rows.length;

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);

  console.log(`hand-curated: ${rows.length} rows written; ${manifest.errors.length} errors`);
}

if (require.main === module) {
  runHandCuratedSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
