'use client';

import * as React from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

// Baazar palette — hot-pink, indigo, haldi yellow, ink, a warmer pink.
// See [[baazar_palette_locked_m_plus]].
const COLORS = ['#D1006C', '#2E3DA3', '#E6A81E', '#1c1816', '#F7B32B'];
const DURATION_MS = 2200;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  rect: boolean;
}

/**
 * One-shot celebratory confetti burst for the "profile is live" moment right
 * after publishing. Canvas-based (many particles, cheap), self-cleaning, and
 * skipped entirely under prefers-reduced-motion. Fires once on mount.
 */
export function PublishConfetti(): React.JSX.Element | null {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (prefersReducedMotion) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();

    const parts: Particle[] = [];
    const cannon = (ox: number, oy: number, dir: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + dir * 0.35 + (Math.random() - 0.5) * 0.9;
        const speed = (7 + Math.random() * 9) * dpr;
        parts.push({
          x: ox,
          y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.32,
          size: (6 + Math.random() * 6) * dpr,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          rect: Math.random() < 0.5,
        });
      }
    };
    // Two corner cannons angled inward + a center pop.
    cannon(0, h, 1, 60);
    cannon(w, h, -1, 60);
    cannon(w / 2, h * 0.92, 0, 40);

    const gravity = 0.22 * dpr;
    const drag = 0.992;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const life = 1 - elapsed / DURATION_MS;
      ctx.clearRect(0, 0, w, h);
      let onscreen = 0;
      for (const p of parts) {
        p.vy += gravity;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < h + 40 && life > 0) onscreen++;
        ctx.globalAlpha = Math.max(0, Math.min(1, life * 1.6));
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.rect) {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (elapsed < DURATION_MS && onscreen > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}
    />
  );
}
