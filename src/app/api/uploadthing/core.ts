import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const f = createUploadthing();

/**
 * All uploads require an authenticated Supabase session. Without this middleware
 * anyone could burn our UploadThing storage/bandwidth. `metadata` returned here
 * is forwarded to `onUploadComplete` so we can attribute the upload if needed.
 */
async function requireAuthedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UploadThingError('Unauthorized');
  return { userId: user.id };
}

export const ourFileRouter = {
  portfolioImage: f({ image: { maxFileSize: '4MB', maxFileCount: 10 } })
    .middleware(requireAuthedUser)
    .onUploadComplete(async ({ file, metadata }) => {
      console.log('Upload complete:', file.url, 'by', metadata.userId);
      return { url: file.url };
    }),
  // Stub for T14 — package feature image uploads (same config as portfolioImage)
  packageFeatureImage: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
    .middleware(requireAuthedUser)
    .onUploadComplete(async ({ file, metadata }) => {
      console.log('Package feature image upload complete:', file.url, 'by', metadata.userId);
      return { url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
