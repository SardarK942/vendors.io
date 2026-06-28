'use client';

interface ExitPreviewPillProps {
  onExit: () => void;
}

export function ExitPreviewPill({ onExit }: ExitPreviewPillProps) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="duration-[180ms] fixed bottom-6 right-6 z-40 rounded-full bg-hot-pink px-4 py-2 text-sm font-medium text-cream shadow-lg transition-[background-color,box-shadow] ease-out hover:bg-hot-pink/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
    >
      ← Exit Preview
    </button>
  );
}
