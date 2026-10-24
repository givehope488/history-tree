/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae2',
          300: '#b0bac9',
          400: '#8291a9',
          500: '#637390',
          600: '#4e5c78',
          700: '#414c62',
          800: '#394253',
          900: '#333a47',
        },
        brand: {
          50: '#fff1f1',
          100: '#ffe0e0',
          200: '#ffc6c7',
          300: '#ff9d9f',
          400: '#fb6569',
          500: '#ef3b41',
          600: '#d92128',
          700: '#b6181e',
          800: '#97181d',
          900: '#7d1a1e',
        },
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Hiragino Sans GB"',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        serif: ['"Noto Serif SC"', '"Songti SC"', 'SimSun', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)',
        pop: '0 12px 32px -8px rgba(16,24,40,.24)',
      },
      keyframes: {
        'hl-flash': {
          '0%': { backgroundColor: 'rgba(255,236,153,.95)', boxShadow: '0 0 0 3px rgba(245,158,11,.55)' },
          '70%': { backgroundColor: 'rgba(255,244,196,.7)', boxShadow: '0 0 0 3px rgba(245,158,11,.25)' },
          '100%': { backgroundColor: 'transparent', boxShadow: '0 0 0 0 rgba(245,158,11,0)' },
        },
        'fade-slide-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'drawer-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'hl-flash': 'hl-flash 2s ease-out 1',
        'fade-slide-in': 'fade-slide-in .18s ease-out',
        'drawer-in': 'drawer-in .2s ease-out',
      },
    },
  },
  plugins: [],
};
