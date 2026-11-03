// DocuSeal API client (self-hosted). Server-only: reads secrets from env.
//
// NOTE: wire shapes below follow DocuSeal's documented public API
// (POST /submissions, GET /submissions/{id}, DELETE /submissions/{id} = archive,
// auth via `X-Auth-Token`). They were NOT verified against a live instance;
// reconfirm paths and field names against the running instance before enabling.
// The rest of the codebase must depend only on the exported types below.

export type SignerRole = 'Vendor' | 'Couple';

export interface CreateSubmissionInput {
  templateId: string;
  order: 'preserved';
  sendEmail: false;
  expireAt: string;
  submitters: Array<{
    role: SignerRole;
    name: string;
    email: string;
    externalId: string;
    order: number;
    fields: Array<{ name: string; defaultValue: string; readonly?: boolean }>;
  }>;
}

export interface CreateSubmissionResult {
  submissionId: string;
  submitters: Array<{ role: SignerRole; slug: string }>;
}

export interface SubmissionDetail {
  status: string;
  documents: Array<{ name: string; url: string }>;
  auditLogUrl: string | null;
}

export function docusealConfig(): { baseUrl: string; token: string } {
  const url = process.env.DOCUSEAL_API_URL;
  const token = process.env.DOCUSEAL_API_TOKEN;
  if (!url || !token) {
    throw new Error('DocuSeal env not configured (DOCUSEAL_API_URL, DOCUSEAL_API_TOKEN)');
  }
  return { baseUrl: url.replace(/\/+$/, ''), token };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const { baseUrl, token } = docusealConfig();
  const headers: Record<string, string> = { 'X-Auth-Token': token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DocuSeal ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => null);
}

function asRole(v: unknown): SignerRole {
  if (v === 'Vendor' || v === 'Couple') return v;
  throw new Error('DocuSeal response: unexpected submitter role');
}

export async function createSubmission(
  input: CreateSubmissionInput
): Promise<CreateSubmissionResult> {
  const templateId = Number(input.templateId);
  const json = await request('POST', '/submissions', {
    template_id: Number.isNaN(templateId) ? input.templateId : templateId,
    send_email: input.sendEmail,
    order: input.order,
    expire_at: input.expireAt,
    submitters: input.submitters.map((s) => ({
      role: s.role,
      name: s.name,
      email: s.email,
      external_id: s.externalId,
      fields: s.fields.map((f) => ({
        name: f.name,
        default_value: f.defaultValue,
        ...(f.readonly !== undefined ? { readonly: f.readonly } : {}),
      })),
    })),
  });

  // Documented response: array of submitter objects, each with submission_id + slug + role.
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('DocuSeal create submission: unexpected response shape');
  }
  const rows = json.filter(isRecord);
  const submissionId = rows[0]?.submission_id;
  if (
    rows.length !== json.length ||
    (typeof submissionId !== 'number' && typeof submissionId !== 'string')
  ) {
    throw new Error('DocuSeal create submission: missing submission_id');
  }
  return {
    submissionId: String(submissionId),
    submitters: rows.map((r) => {
      if (typeof r.slug !== 'string') throw new Error('DocuSeal create submission: missing slug');
      return { role: asRole(r.role), slug: r.slug };
    }),
  };
}

export async function getSubmission(submissionId: string): Promise<SubmissionDetail> {
  const json = await request('GET', `/submissions/${encodeURIComponent(submissionId)}`);
  if (!isRecord(json) || typeof json.status !== 'string') {
    throw new Error('DocuSeal get submission: unexpected response shape');
  }
  const documents = Array.isArray(json.documents)
    ? json.documents
        .filter(isRecord)
        .flatMap((d) =>
          typeof d.name === 'string' && typeof d.url === 'string'
            ? [{ name: d.name, url: d.url }]
            : []
        )
    : [];
  return {
    status: json.status,
    documents,
    auditLogUrl: typeof json.audit_log_url === 'string' ? json.audit_log_url : null,
  };
}

// DocuSeal "archive" = DELETE /submissions/{id} (soft-archives the submission).
export async function archiveSubmission(submissionId: string): Promise<void> {
  await request('DELETE', `/submissions/${encodeURIComponent(submissionId)}`);
}
