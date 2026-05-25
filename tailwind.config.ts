import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Baazar M+ brand tokens — prefer these for NEW code ─────
        // Supports alpha modifiers: bg-ink/50, text-cream/80, etc.
        cream: {
          DEFAULT: 'hsl(var(--cream) / <alpha-value>)',
          soft: 'hsl(var(--cream-soft) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'hsl(var(--ink) / <alpha-value>)',
          muted: 'hsl(var(--ink-muted) / <alpha-value>)',
          soft: 'hsl(var(--ink-soft) / <alpha-value>)',
        },
        indigo: {
          DEFAULT: 'hsl(var(--indigo) / <alpha-value>)',
          soft: 'hsl(var(--indigo-soft) / <alpha-value>)',
        },
        'hot-pink': 'hsl(var(--hot-pink) / <alpha-value>)',
        haldi: 'hsl(var(--haldi) / <alpha-value>)',
        hairline: {
          DEFAULT: 'hsl(var(--hairline) / <alpha-value>)',
          soft: 'hsl(var(--hairline-soft) / <alpha-value>)',
        },
        error: 'hsl(var(--error) / <alpha-value>)',

        // ── shadcn semantic tokens — kept for existing component compat ──
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        // DESIGN.md radii — overrides Tailwind defaults for sm/md/lg.
        // xl, 2xl, 3xl, full inherit Tailwind defaults (12/16/24/9999px).
        sm: '4px', // radii.sm
        md: '6px', // radii.md
        lg: '10px', // radii.lg
      },
      fontFamily: {
        // DESIGN.md TY-C — Spectral display, Schibsted Grotesk body, DM Mono.
        // Variables set by next/font in src/app/layout.tsx.
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Override Tailwind's default sans so every untyped element gets Schibsted.
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'sans-serif'],
        // serif maps to display family for headlines/eds.
        serif: ['var(--font-display)', 'Georgia', 'serif'],
        'wordmark-deva': ['var(--font-wordmark-deva)', 'serif'],
        'wordmark-nastaliq': ['var(--font-wordmark-nastaliq)', 'serif'],
        'wordmark-naskh': ['var(--font-wordmark-naskh)', 'serif'],
        'wordmark-persian': ['var(--font-wordmark-persian)', 'serif'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
