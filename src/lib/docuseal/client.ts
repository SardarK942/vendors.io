// DocuSeal API client (self-hosted). Server-only: reads secrets from env.
//
// DOCUSEAL_API_URL is the instance HOST ROOT (e.g. http://localhost:3030).
// Self-hosted DocuSeal serves its REST API under `/api`, so this client
// prepends `/api` to every endpoint. The public signing page lives at the
// host root (`${DOCUSEAL_API_URL}/s/{slug}`), which is why the base stays the
// host root rather than the `/api` path — the service layer builds signer
// links off the same env var.
//
// NOTE: wire shapes below follow DocuSeal's documented public API
// (POST /api/submissions, GET /api/submissions/{id}, DELETE /api/submissions/{id} = archive,
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
  const json = await request('POST', '/api/submissions', {
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
  const json = await request('GET', `/api/submissions/${encodeURIComponent(submissionId)}`);
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

/**
 * Map each template field NAME to the role (submitter name) that owns it.
 * DocuSeal validates submission fields per-submitter, so the caller must send a
 * field only to the submitter whose role owns it. Fields with no name or whose
 * submitter can't be resolved are skipped.
 */
export async function getTemplateFieldRoles(templateId: string): Promise<Map<string, string>> {
  const json = await request('GET', `/api/templates/${encodeURIComponent(templateId)}`);
  if (!isRecord(json)) throw new Error('DocuSeal get template: unexpected response shape');
  const roleByUuid = new Map<string, string>();
  if (Array.isArray(json.submitters)) {
    for (const s of json.submitters) {
      if (isRecord(s) && typeof s.uuid === 'string' && typeof s.name === 'string') {
        roleByUuid.set(s.uuid, s.name);
      }
    }
  }
  const roleByField = new Map<string, string>();
  if (Array.isArray(json.fields)) {
    for (const f of json.fields) {
      if (!isRecord(f) || typeof f.name !== 'string' || !f.name) continue;
      const role = typeof f.submitter_uuid === 'string' ? roleByUuid.get(f.submitter_uuid) : null;
      if (role) roleByField.set(f.name, role);
    }
  }
  return roleByField;
}

// DocuSeal "archive" = DELETE /api/submissions/{id} (soft-archives the submission).
export async function archiveSubmission(submissionId: string): Promise<void> {
  await request('DELETE', `/api/submissions/${encodeURIComponent(submissionId)}`);
}

/** Download a DocuSeal-hosted artifact (signed PDF / audit log) with the API token. */
export async function downloadArtifact(url: string): Promise<Buffer> {
  const { token } = docusealConfig();
  const res = await fetch(url, { headers: { 'X-Auth-Token': token } });
  if (!res.ok) throw new Error(`DocuSeal artifact download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
