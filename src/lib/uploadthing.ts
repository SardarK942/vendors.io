// Typed UploadThing helpers for client components.
// The route handler is at src/app/api/uploadthing/route.ts.
// File router definition is at src/app/api/uploadthing/core.ts.

import {
  generateUploadButton,
  generateUploadDropzone,
  generateReactHelpers,
} from '@uploadthing/react';
import type { OurFileRouter } from '@/app/api/uploadthing/core';

export const UploadButton = generateUploadButton<OurFileRouter>();
export const UploadDropzone = generateUploadDropzone<OurFileRouter>();

const { useUploadThing: _useUploadThing } = generateReactHelpers<OurFileRouter>();
export const useUploadThing = _useUploadThing;
