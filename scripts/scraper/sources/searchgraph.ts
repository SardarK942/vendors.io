import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { CHICAGO_METRO_LOCALES } from '../data/chicago-locales';
import type { ScrapedRow } from '../lib/schemas';

const execFileP = promisify(execFile);
const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/searchgraph');
const PYTHON_ROOT = path.join(process.cwd(), 'scripts/scraper/python');

const QUERIES = [
  'Pakistani caterer',
  'Indian caterer',
  'Afghan caterer',
  'Bangladeshi caterer',
  'Arab caterer',
  'desi wedding cart',
  'paan cart',
  'chai cart',
];

function inferCategoryFromQuery(q: string): string {
  if (q.includes('cart')) return 'carts';
  if (q.includes('caterer')) return 'catering';
  return 'catering';
}

export async function runSearchgraphSource(): Promise<void> {
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('searchgraph', runDate);
  const rows: ScrapedRow[] = [];

  for (const baseQuery of QUERIES) {
    for (const locale of CHICAGO_METRO_LOCALES.slice(0, 12)) {
      const query = `${baseQuery} ${locale}`;
      const slug = query.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const outFile = path.join(outDir, `${slug}.json`);
      manifest.queries_executed += 1;
      try {
        await execFileP(
          'uv',
          [
            'run',
            'python',
            'search_discover.py',
            '--query',
            query,
            '--out',
            outFile,
            '--max-results',
            '5',
          ],
          { cwd: PYTHON_ROOT, env: { ...process.env }, timeout: 180_000 }
        );
        const text = await fs.readFile(outFile, 'utf8');
        const parsed = JSON.parse(text) as unknown;
        const vendors = Array.isArray(parsed)
          ? (parsed as Array<Record<string, unknown>>)
          : (((parsed as Record<string, unknown>).vendors as Array<Record<string, unknown>>) ?? []);
        for (const v of vendors) {
          rows.push({
            source: 'searchgraph',
            business_name: ((v.business_name as string) ?? (v.name as string)) || 'unknown',
            category: inferCategoryFromQuery(baseQuery),
            tags: [`query:${baseQuery}`],
            city: locale.replace(/ IL$/, ''),
            state: 'IL',
            phone: (v.phone as string) ?? undefined,
            website: (v.website as string) ?? undefined,
            instagram_handle: (v.instagram_handle as string) ?? undefined,
            bio: (v.description as string) ?? undefined,
            photos: [],
            raw: v,
          });
        }
      } catch (e) {
        manifest.errors.push({
          context: query,
          code: 'SEARCHGRAPH_ERROR',
          message: e instanceof Error ? e.message : String(e),
          ts: new Date().toISOString(),
        });
      }
    }
  }

  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(`searchgraph: ${rows.length} rows`);
}

if (require.main === module) {
  runSearchgraphSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
