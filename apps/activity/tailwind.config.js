/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The site's own tokens, so the activity reads as the same product. The
        // `basketball` ramp is the accent the chain game already draws with.
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
        brand: {
          navy: '#1C4188',
          navyDark: '#0A2250',
          orange: '#C4502F',
          cream: '#FCF3DC',
          gold: '#FDB927',
          red: '#882233',
          green: '#1C7A4A',
          ink: '#20201E',
          line: '#E8E3DD',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['Oswald', 'Poppins', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
