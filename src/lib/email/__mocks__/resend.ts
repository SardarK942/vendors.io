export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RecordedSend {
  to: string;
  subject: string;
  html: string;
  notificationId?: string;
  at: string;
}

let store: RecordedSend[] = [];

export function getRecordedSends(): RecordedSend[] {
  return [...store];
}

export function clearRecordedSends(): void {
  store = [];
}

export async function sendWithRecord(args: {
  to: string;
  subject: string;
  html: string;
  notificationId?: string;
}): Promise<{ ok: true; id: string }> {
  store.push({ ...args, at: new Date().toISOString() });
  return { ok: true, id: `mock_${store.length}` };
}
