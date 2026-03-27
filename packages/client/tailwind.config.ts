import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold:   { 400: '#9a7018', 500: '#7a5410', 600: '#5a3c08' },
        parch:  { 50: '#fefcf5', 100: '#f5e8c8', 200: '#e0cfa0', 300: '#c4a870' },
        ink:    { 700: '#5a3818', 800: '#3a2010', 900: '#1a0a04' },
        danger: { 400: '#963020', 500: '#742418' },
        safe:   { 400: '#2a6840', 500: '#1e5030' },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        mono:  ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
