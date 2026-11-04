/**
 * Private Supabase Storage helper for e-signature contract artifacts
 * (signed PDF + audit certificate).
 *
 * NOTE: the private `contracts` bucket must be provisioned out-of-band
 * (Supabase dashboard, or `insert into storage.buckets (id, name, public)
 * values ('contracts', 'contracts', false)`) in every environment. This
 * module does not create it. Access is via the service-role client only;
 * hand out short-lived signed URLs, never public URLs.
 */
import { createServiceRoleClient } from '@/lib/supabase/server';

const BUCKET = 'contracts';
const DEFAULT_EXPIRY_SECONDS = 3600;

export type ContractArtifactKind = 'signed' | 'certificate';

export async function storeContractArtifact(args: {
  bookingId: string;
  kind: ContractArtifactKind;
  body: ArrayBuffer | Buffer;
  contentType: string;
}): Promise<string> {
  const key = `contracts/${args.bookingId}/${args.kind}.pdf`;
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, args.body, { contentType: args.contentType, upsert: true });
  if (error) {
    throw new Error(`Failed to store contract artifact ${key}: ${error.message}`);
  }
  return key;
}

export async function getContractSignedUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error) {
    throw new Error(`Failed to sign contract URL for ${key}: ${error.message}`);
  }
  if (!data?.signedUrl) {
    throw new Error(`No signed URL returned for ${key}`);
  }
  return data.signedUrl;
}
