/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        app: {
          bg:      'var(--bg)',
          surface: 'var(--surface)',
          raised:  'var(--raised)',
          input:   'var(--input)',
          border:  'var(--border)',
          muted:   'var(--border-light)',
        },
      },
      animation: {
        'pulse-fast': 'pulse 0.75s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-lime': 'glowLime 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        glowLime: {
          from: { boxShadow: '0 0 6px var(--accent-border)' },
          to:   { boxShadow: '0 0 18px var(--accent-glow), 0 0 32px var(--accent-dim)' },
        },
      },
    },
  },
  plugins: [],
};
