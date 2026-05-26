// Tailwind v3 config.
//
// Theme bridges into the CSS variables defined in styles.scss so the
// utilities (text-mc-text, bg-mc-bg-elev, border-mc-border, …) honour
// the dark/light tokens automatically. Add a new colour here ONLY if it
// also exists as a --mc-* variable.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './projects/**/*.{html,ts}',
    './projects/**/src/**/*.{html,ts,scss}',
  ],
  theme: {
    extend: {
      colors: {
        'mc-bg':         'var(--mc-bg)',
        'mc-bg-elev':    'var(--mc-bg-elev)',
        'mc-bg-hover':   'var(--mc-bg-hover)',
        'mc-border':     'var(--mc-border)',
        'mc-text':       'var(--mc-text)',
        'mc-text-muted': 'var(--mc-text-muted)',
        'mc-text-faint': 'var(--mc-text-faint)',
        'mc-accent':     'var(--mc-accent)',
        'mc-accent-soft':'var(--mc-accent-soft)',
        'mc-success':    'var(--mc-success)',
        'mc-warning':    'var(--mc-warning)',
        'mc-danger':     'var(--mc-danger)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  // Dark mode is driven by `color-scheme` + CSS vars, not by class. We
  // could enable `darkMode: 'media'` but the vars already handle it.
  plugins: [],
};
