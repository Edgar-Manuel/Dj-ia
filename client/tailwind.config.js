/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#07070d',
        panel: '#0d0e17',
        'panel-2': '#12131f',
        line: '#1e2030',
        neon: {
          cyan: '#22d3ee',
          magenta: '#e879f9',
          lime: '#a3e635',
          amber: '#fbbf24',
          red: '#ff2965',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 12px rgba(34, 211, 238, 0.45), 0 0 40px rgba(34, 211, 238, 0.12)',
        'neon-magenta': '0 0 12px rgba(232, 121, 249, 0.45), 0 0 40px rgba(232, 121, 249, 0.12)',
        glow: '0 0 24px rgba(34, 211, 238, 0.08)',
      },
      keyframes: {
        'pulse-beat': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(0.97)' },
        },
      },
    },
  },
  plugins: [],
};
