/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090D',
          900: '#0B1018',
          850: '#0E141D',
          800: '#111923',
          750: '#151F2B',
          700: '#1A2532',
        },
        line: {
          DEFAULT: 'rgba(146,158,173,0.14)',
          strong: 'rgba(146,158,173,0.24)',
        },
        txt: {
          DEFAULT: '#F5F7FA',
          muted: '#929EAD',
          faint: '#7A8794',
        },
        cyan: {
          DEFAULT: '#00D4FF',
          soft: 'rgba(0,212,255,0.12)',
        },
        violet: {
          DEFAULT: '#8B5CF6',
          soft: 'rgba(139,92,246,0.12)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.035) inset, 0 30px 70px -45px rgba(0,0,0,0.9)',
        lift: '0 24px 48px -24px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.05) inset',
        glow: '0 0 0 1px rgba(0,212,255,0.22), 0 12px 40px -12px rgba(0,212,255,0.35)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 0.8, 0.24, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up-sheet': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'bar-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.22,0.8,0.24,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'spin-slow': 'spin-slow 26s linear infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        'slide-in-right': 'slide-in-right 0.32s cubic-bezier(0.22,0.8,0.24,1) both',
        'slide-up-sheet': 'slide-up-sheet 0.32s cubic-bezier(0.22,0.8,0.24,1) both',
        'bar-indeterminate': 'bar-indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
