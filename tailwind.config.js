/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sampled from src/assets/captain.jpg — the storm/sea/hull teal-slate
        steel: {
          50: '#e9eeee',
          100: '#c9d5d5',
          200: '#9cb4b4',
          300: '#849c9c',
          400: '#6c8484',
          500: '#546c6c',
          600: '#3c5454',
          700: '#24393a',
          800: '#16292a',
          900: '#0c1a1a',
          950: '#061011',
        },
        // Cap braid / shoulder boards / rank stripes
        brass: {
          200: '#f7e6b8',
          300: '#f2d489',
          400: '#e6c063',
          500: '#d4a72c',
          600: '#b8891c',
          700: '#8f6813',
        },
        // Muzzle flash and burning hulls
        ember: {
          300: '#ffc073',
          400: '#ff9d4d',
          500: '#f2733a',
          600: '#d94f2b',
          700: '#a83618',
        },
      },
    },
  },
  plugins: [],
}
