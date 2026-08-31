/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}', '../extension/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#09090b',
        surface: '#121214',
        elev: '#18181b',
        brd: '#27272a',
        jade: { DEFAULT: '#10b981', deep: '#0d9668', dim: '#064e3b' },
        mint: '#d1fae5',
        gold: '#e6cf8f',
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
