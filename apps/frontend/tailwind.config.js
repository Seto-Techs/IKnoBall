/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        basketball: {
          50: '#fdf5f0',
          100: '#fae8dc',
          200: '#f5ceb8',
          300: '#eead8a',
          400: '#E05E36',
          500: '#C94D2E',
          600: '#a83d22',
          700: '#8c301b',
          800: '#75291a',
          900: '#632519',
        },
        court: {
          50: '#faf8f6',
          100: '#f5f0ea',
          200: '#ebe0d5',
          300: '#dcc8b5',
          400: '#D4A373',
          500: '#c08f5c',
          600: '#ac7b4b',
          700: '#8f643e',
          800: '#765336',
          900: '#614630',
        },
        arena: {
          50: '#f0f9fb',
          100: '#d9f0f4',
          200: '#b7e1ea',
          300: '#84cbdc',
          400: '#4fb3cb',
          500: '#2B9EB3',
          600: '#258096',
          700: '#23677a',
          800: '#245564',
          900: '#224755',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
