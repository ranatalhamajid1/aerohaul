/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        ink: v('text'),
        muted: v('muted'),
        faint: v('faint'),
        line: v('line-rgb'),
        accent: v('accent'),
        'accent-ink': v('accent-ink'),
        surface: v('surface'),
        risk: {
          low: v('risk-low'),
          moderate: v('risk-moderate'),
          high: v('risk-high'),
          severe: v('risk-severe'),
          notravel: v('risk-notravel'),
        },
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'ui-sans-serif', 'system-ui'],
        sans: ['"Manrope Variable"', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { panel: '18px' },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        lift: 'var(--shadow-lift)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.22,1,.36,1)' },
    },
  },
  plugins: [],
};
