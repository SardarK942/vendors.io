import { createUploadthing, type FileRouter } from 'uploadthing/next';

const f = createUploadthing();

export const ourFileRouter = {
  portfolioImage: f({ image: { maxFileSize: '4MB', maxFileCount: 10 } })
    .middleware(async () => {
      // Auth check would go here with Supabase
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      console.log('Upload complete:', file.url);
      return { url: file.url };
    }),
  // Stub for T14 — package feature image uploads (same config as portfolioImage)
  packageFeatureImage: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
    .middleware(async () => {
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      console.log('Package feature image upload complete:', file.url);
      return { url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
