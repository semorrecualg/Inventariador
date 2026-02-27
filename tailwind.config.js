
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-main': '#F8FAFC',
        'surface': '#FFFFFF',
        'ink': '#0F172A',
        'ink-muted': '#64748B',
        'accent': '#0284C7',
        'border': '#E2E8F0',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-in-out forwards',
        slideUp: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        scaleIn: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        bounceIn: 'bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
