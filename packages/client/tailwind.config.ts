import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold:   { 400: '#f5c842', 500: '#d4a017', 600: '#b8860b' },
        parch:  { 50: '#fdf8ec', 100: '#f9efce', 200: '#f0d98a' },
        ink:    { 700: '#2c1a0e', 800: '#1a0e07', 900: '#0d0703' },
        danger: { 400: '#e85d4a', 500: '#c94030' },
        safe:   { 400: '#5dba7e', 500: '#3d9a60' },
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
