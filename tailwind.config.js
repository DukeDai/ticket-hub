/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f0',
          100: '#ffdedb',
          500: '#1677ff',
          600: '#0958d9',
          700: '#003eb3',
        },
      },
    },
  },
  plugins: [],
};

export default config;
