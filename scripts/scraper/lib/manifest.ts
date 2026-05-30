import fs from 'node:fs/promises';
import path from 'node:path';

export interface RunManifest {
  source: string;
  run_date: string; // YYYY-MM-DD
  started_at: string; // ISO
  finished_at?: string;
  queries_executed: number;
  records_returned: number;
  errors: Array<{ context: string; code: string; message: string; ts: string }>;
  cost_estimate_usd?: number;
  notes?: string;
}

export function emptyManifest(source: string, runDate: string): RunManifest {
  return {
    source,
    run_date: runDate,
    started_at: new Date().toISOString(),
    queries_executed: 0,
    records_returned: 0,
    errors: [],
  };
}

export function todayRunDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function writeManifest(dumpDir: string, manifest: RunManifest): Promise<void> {
  manifest.finished_at = new Date().toISOString();
  await fs.mkdir(dumpDir, { recursive: true });
  await fs.writeFile(path.join(dumpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
