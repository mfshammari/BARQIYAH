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
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        brand: { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', dark: 'rgb(var(--brand-dark) / <alpha-value>)', soft: 'rgb(var(--brand-soft) / <alpha-value>)' },
        gold: { DEFAULT: 'rgb(var(--gold) / <alpha-value>)', soft: 'rgb(var(--gold-soft) / <alpha-value>)', line: 'rgb(var(--gold-line) / <alpha-value>)' },
        ok: { DEFAULT: 'rgb(var(--ok) / <alpha-value>)', soft: 'rgb(var(--ok-soft) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)', soft: 'rgb(var(--warn-soft) / <alpha-value>)' },
        danger: { DEFAULT: 'rgb(var(--danger) / <alpha-value>)', soft: 'rgb(var(--danger-soft) / <alpha-value>)' },
        info: { DEFAULT: 'rgb(var(--info) / <alpha-value>)', soft: 'rgb(var(--info-soft) / <alpha-value>)' },
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
