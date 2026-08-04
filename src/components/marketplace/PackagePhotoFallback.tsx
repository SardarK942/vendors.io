interface Props {
  name: string;
  className?: string;
}

/**
 * Cream-toned tile shown in place of a package's featured image when the
 * vendor hasn't uploaded one yet. Mirrors the "custom request" tile treatment
 * already used in PackageGrid: aspect-locked container styles it, we fill.
 */
export function PackagePhotoFallback({ name, className }: Props) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-cream-soft outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10 ${className ?? ''}`}
      aria-hidden="true"
    >
      <span
        className="px-4 text-center font-display text-xl font-medium leading-tight text-ink-soft"
        translate="no"
      >
        {name}
      </span>
    </div>
  );
}
