'use client';

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';

import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

interface Props {
  /** Pixel coordinates relative to viewport */
  x: number;
  y: number;
  onComplete?: () => void;
}

const DOT_COUNT = 12;
const DURATION_MS = 1000;

export function HeartConfetti({ x, y, onComplete }: Props): React.JSX.Element | null {
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    // Honor reduce-motion by skipping the confetti animation entirely; still
    // signal completion so the caller can unmount/cleanup on the same frame.
    const delay = prefersReducedMotion ? 0 : DURATION_MS;
    const t = setTimeout(() => onComplete?.(), delay);
    return () => clearTimeout(t);
  }, [onComplete, prefersReducedMotion]);

  const dots = React.useMemo(() => {
    return Array.from({ length: DOT_COUNT }, (_, i) => {
      const angle = (Math.PI * 2 * i) / DOT_COUNT;
      const distance = 60 + Math.random() * 30;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const color = i % 2 === 0 ? '#D1006C' : '#E11D48'; // hot-pink, red
      const size = 6 + Math.random() * 4;
      return { dx, dy, color, size, delay: Math.random() * 100 };
    });
  }, []);

  if (prefersReducedMotion) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {dots.map((dot, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              width: dot.size,
              height: dot.size,
              borderRadius: '50%',
              backgroundColor: dot.color,
              animation: `heart-confetti ${DURATION_MS}ms ease-out ${dot.delay}ms forwards`,
              '--dx': `${dot.dx}px`,
              '--dy': `${dot.dy}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <style>{`
        @keyframes heart-confetti {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function showHeartConfettiToast(vendorName: string, anchorEl: HTMLElement | null) {
  // Render confetti at the heart icon's screen position
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(
      <HeartConfetti
        x={rect.left + rect.width / 2}
        y={rect.top + rect.height / 2}
        onComplete={() => {
          root.unmount();
          container.remove();
        }}
      />
    );
  }
  // Toast — 6 seconds, locked verbatim copy
  toast(`❤️ First save! Find ${vendorName} in your Saved →`, {
    duration: 6000,
    action: {
      label: 'View',
      onClick: () => {
        window.location.href = '/dashboard/saved';
      },
    },
  });
}
