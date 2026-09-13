'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ExportButtonsProps {
  /** Pre-serialized CSV (built server-side via toCsv). */
  csv: string;
  /** Deduped, comma-joined email list for clipboard. */
  emails: string;
  /** Base filename (no extension) for the downloaded CSV. */
  filename: string;
}

/**
 * Client-side cohort export: downloads the CSV that was serialized on the server
 * and copies the email list to the clipboard. No data is sent anywhere — both
 * actions operate on strings already rendered into the page.
 */
export function ExportButtons({ csv, emails, filename }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permissions) — no-op; the CSV
      // still carries the emails.
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        Export CSV
      </Button>
      <Button variant="outline" size="sm" onClick={copyEmails} disabled={!emails}>
        {copied ? 'Copied!' : 'Copy emails'}
      </Button>
    </div>
  );
}
