import type { Config } from 'tailwindcss';

/**
 * كل الألوان تشير إلى متغيّرات CSS في src/app/globals.css
 * → تغيير الهوية اللونية يتم من مكان واحد فقط.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        brand: { DEFAULT: 'var(--brand)', dark: 'var(--brand-dark)', soft: 'var(--brand-soft)' },
        gold: { DEFAULT: 'var(--gold)', soft: 'var(--gold-soft)', line: 'var(--gold-line)' },
        ok: { DEFAULT: 'var(--ok)', soft: 'var(--ok-soft)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        cerem: ['var(--font-cerem)'],
      },
      borderRadius: { xl: 'var(--radius)', '2xl': 'calc(var(--radius) + 6px)' },
      boxShadow: {
        card: '0 1px 2px rgba(20,30,25,.04), 0 6px 20px -12px rgba(20,30,25,.18)',
        pop: '0 10px 40px -12px rgba(20,30,25,.28)',
      },
    },
  },
  plugins: [],
};
export default config;
