import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentType, ReactNode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PhotoUploaderDrawer } from '@/components/ui/PhotoUploaderDrawer';

// ── Capture the useUploadThing options so we can drive onUploadError. ──────────
const startUpload = vi.fn();
let uploadOpts: { onUploadError?: (e: { message?: string }) => void } = {};
vi.mock('@/lib/uploadthing', () => ({
  useUploadThing: (_endpoint: string, opts: typeof uploadOpts) => {
    uploadOpts = opts;
    return { startUpload, isUploading: false };
  },
}));

// ── Minimal family-drawer shell: render the current view inline. ──────────────
vi.mock('@/components/ui/family-drawer', () => {
  const ctx: {
    view: string;
    views: Record<string, ComponentType>;
    setView: () => void;
    close: () => void;
  } = {
    view: 'default',
    views: {},
    setView: () => {},
    close: () => {},
  };
  const Pass = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    useFamilyDrawer: () => ctx,
    FamilyDrawerRoot: ({
      children,
      views,
      defaultView,
    }: {
      children: ReactNode;
      views: Record<string, ComponentType>;
      defaultView?: string;
    }) => {
      ctx.views = views;
      ctx.view = defaultView ?? 'default';
      return <div>{children}</div>;
    },
    FamilyDrawerTrigger: ({ children }: { children: ReactNode }) => (
      <button type="button">{children}</button>
    ),
    FamilyDrawerPortal: Pass,
    FamilyDrawerOverlay: () => null,
    FamilyDrawerContent: Pass,
    FamilyDrawerClose: () => null,
    FamilyDrawerAnimatedWrapper: Pass,
    FamilyDrawerAnimatedContent: Pass,
    FamilyDrawerViewContent: () => {
      const V = ctx.views[ctx.view];
      return V ? <V /> : null;
    },
  };
});

function file(name: string, sizeMb: number): File {
  const f = new File([], name, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: Math.round(sizeMb * 1024 * 1024) });
  return f;
}

function renderUploader() {
  return render(
    <PhotoUploaderDrawer
      value={[]}
      onChange={() => {}}
      endpoint="portfolioImage"
      maxFiles={10}
      maxSizeMb={16}
    />
  );
}

describe('<PhotoUploaderDrawer /> failure surfacing (iPhone silent-fail fix)', () => {
  beforeEach(() => {
    startUpload.mockClear();
    uploadOpts = {};
  });

  it('shows a visible error when an upload fails instead of failing silently', () => {
    renderUploader();
    act(() => {
      uploadOpts.onUploadError?.({ message: 'FileSizeMismatch: too large' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/too large/i);
  });

  it('skips oversized photos with a warning and does not upload them', () => {
    renderUploader();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file('huge.jpg', 20)] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/over 16MB/i);
    expect(startUpload).not.toHaveBeenCalled();
  });

  it('uploads valid photos and warns only about the skipped oversized one', () => {
    renderUploader();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file('ok.jpg', 3), file('huge.jpg', 20)] } });
    expect(startUpload).toHaveBeenCalledTimes(1);
    expect(startUpload.mock.calls[0][0].map((f: File) => f.name)).toEqual(['ok.jpg']);
    expect(screen.getByRole('alert')).toHaveTextContent(/over 16MB/i);
  });
});
