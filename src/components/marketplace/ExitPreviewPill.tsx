'use client';

interface ExitPreviewPillProps {
  onExit: () => void;
}

export function ExitPreviewPill({ onExit }: ExitPreviewPillProps) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="duration-[180ms] fixed bottom-6 right-6 z-40 rounded-full bg-hot-pink px-4 py-2 text-sm font-medium text-cream shadow-lg transition-all ease-out hover:bg-hot-pink/90 hover:shadow-xl"
    >
      ← Exit Preview
    </button>
  );
}
