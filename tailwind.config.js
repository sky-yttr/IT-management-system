/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./views/**/*.ejs'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        'surface':        '#f8f9ff',
        'surface-low':    '#eff4ff',
        'surface-card':   '#ffffff',
        'on-surface':     '#0d1c2e',
        'on-surface-var': '#444653',
        'outline':        '#757684',
        'outline-var':    '#c4c5d5',
        'primary':        '#1e40af',
        'primary-dark':   '#00288e',
        'primary-light':  '#dde1ff',
        'secondary':      '#006a61',
        'secondary-light':'#86f2e4',
        'error':          '#ba1a1a',
        'error-light':    '#ffdad6',
        'status-open-bg':    '#ffe4d4',
        'status-open-text':  '#9a3412',
        'status-prog-bg':    '#dde1ff',
        'status-prog-text':  '#1e40af',
        'status-pend-bg':    '#fef3c7',
        'status-pend-text':  '#92400e',
        'status-closed-bg':  '#a7f3d0',
        'status-closed-text':'#065f46',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
