'use client';
import { createContext, useContext, useRef, useState, useEffect } from 'react';
import { Upload, Plus } from 'lucide-react';
import {
  FamilyDrawerRoot,
  FamilyDrawerTrigger,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerClose,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerAnimatedContent,
  FamilyDrawerViewContent,
  useFamilyDrawer,
  type ViewsRegistry,
} from './family-drawer';
import { PhotoThumbnailGrid } from './PhotoThumbnailGrid';
import { useUploadThing } from '@/lib/uploadthing';

interface PhotoUploaderDrawerProps {
  value: string[];
  onChange: (urls: string[]) => void;
  endpoint: 'portfolioImage' | 'packageFeatureImage';
  maxFiles?: number;
  maxSizeMb?: number;
  showPrimarySelector?: boolean;
  triggerLabel?: { empty: string; manage: string };
}

// Share value + onChange + endpoint with the inner views via a small context
interface UploaderContextValue {
  value: string[];
  onChange: (urls: string[]) => void;
  endpoint: PhotoUploaderDrawerProps['endpoint'];
  maxFiles: number;
  maxSizeMb: number;
  showPrimarySelector: boolean;
}

const UploaderContext = createContext<UploaderContextValue | null>(null);

function useUploader(): UploaderContextValue {
  const ctx = useContext(UploaderContext);
  if (!ctx) throw new Error('useUploader must be used inside PhotoUploaderDrawer');
  return ctx;
}

function DefaultView() {
  const { setView } = useFamilyDrawer();
  const { value, onChange, endpoint, maxFiles, maxSizeMb } = useUploader();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (res) => {
      const newUrls = res.map((r) => r.url);
      onChange([...valueRef.current, ...newUrls].slice(0, maxFiles));
      setView('manage');
    },
    onUploadError: (err) => {
      console.error('Upload failed:', err);
    },
  });

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = maxFiles - value.length;
    const accepted = Array.from(files).slice(0, remaining);
    startUpload(accepted);
  }

  return (
    <div>
      <button
        type="button"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={`w-full rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          isDragging ? 'border-hot-pink bg-cream/95' : 'border-ink/40 bg-cream'
        } ${isUploading ? 'cursor-wait opacity-60' : ''}`}
      >
        <Upload
          className={`mx-auto mb-3 size-10 ${isDragging ? 'text-hot-pink' : 'text-ink/60'}`}
        />
        <p className="mb-1 text-sm font-medium text-ink">
          {isUploading ? 'Uploading…' : isDragging ? 'Drop Photos Here' : 'Drag photos here'}
        </p>
        <p className="text-xs text-ink/60">or Click to Browse</p>
        <p className="mt-4 text-xs text-ink/50">
          JPG, PNG, or WebP · max {maxSizeMb}
          {' '}MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </button>
    </div>
  );
}

function ManageView() {
  const { setView, close } = useFamilyDrawer();
  const { value, onChange, endpoint, maxFiles, showPrimarySelector } = useUploader();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (res) => {
      const newUrls = res.map((r) => r.url);
      onChange([...valueRef.current, ...newUrls].slice(0, maxFiles));
    },
  });

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function setPrimary(idx: number) {
    if (idx === 0) return;
    const next = [...value];
    const [chosen] = next.splice(idx, 1);
    onChange([chosen!, ...next]);
  }

  function handleAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = maxFiles - value.length;
    if (remaining <= 0) return;
    startUpload(Array.from(files).slice(0, remaining));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink">
          {value.length} of {maxFiles} photo{value.length === 1 ? '' : 's'}
        </p>
        {value.length < maxFiles && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-cream px-2 py-1 text-xs font-medium text-ink hover:bg-ink/5"
            >
              <Plus className="size-3" /> Add more
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleAddFiles(e.target.files)}
            />
          </>
        )}
      </div>

      <PhotoThumbnailGrid
        urls={value}
        showPrimarySelector={showPrimarySelector}
        onRemove={removeAt}
        onSetPrimary={setPrimary}
        onReorder={onChange}
      />

      <button
        type="button"
        onClick={() => {
          setView('default');
          close();
        }}
        className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-cream hover:bg-ink/90"
      >
        Done
      </button>
    </div>
  );
}

const photoUploaderViews: ViewsRegistry = {
  default: DefaultView,
  manage: ManageView,
};

export function PhotoUploaderDrawer({
  value,
  onChange,
  endpoint,
  maxFiles = 10,
  maxSizeMb = 4,
  showPrimarySelector = false,
  triggerLabel = { empty: 'Upload photos', manage: 'Manage photos' },
}: PhotoUploaderDrawerProps) {
  const ctxValue = { value, onChange, endpoint, maxFiles, maxSizeMb, showPrimarySelector };

  return (
    <UploaderContext.Provider value={ctxValue}>
      <FamilyDrawerRoot
        views={photoUploaderViews}
        defaultView={value.length === 0 ? 'default' : 'manage'}
      >
        {/* Closed-state representation (thumbnail strip + button) */}
        {value.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto">
            {value.slice(0, 5).map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 56px thumb strip; explicit w/h prevents CLS during upload */}
                <img
                  src={url}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {showPrimarySelector && i === 0 && (
                  <span className="absolute left-0 top-0 rounded-br-md bg-hot-pink px-1 py-0.5 text-[8px] font-medium text-cream">
                    Primary
                  </span>
                )}
              </div>
            ))}
            {value.length > 5 && (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-ink/10 text-xs text-ink">
                +{value.length - 5}
              </div>
            )}
          </div>
        )}

        <FamilyDrawerTrigger className="inline-flex items-center gap-1.5 rounded-md border border-ink bg-cream px-3 py-2 text-sm font-medium text-ink hover:bg-ink/5">
          <Upload className="size-4" />
          {value.length === 0 ? triggerLabel.empty : `${triggerLabel.manage} (${value.length})`}
        </FamilyDrawerTrigger>

        <FamilyDrawerPortal>
          <FamilyDrawerOverlay />
          <FamilyDrawerContent>
            <FamilyDrawerClose />
            <FamilyDrawerAnimatedWrapper>
              <FamilyDrawerAnimatedContent>
                <FamilyDrawerViewContent />
              </FamilyDrawerAnimatedContent>
            </FamilyDrawerAnimatedWrapper>
          </FamilyDrawerContent>
        </FamilyDrawerPortal>
      </FamilyDrawerRoot>
    </UploaderContext.Provider>
  );
}
