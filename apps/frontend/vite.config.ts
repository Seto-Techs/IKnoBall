import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/auth': {
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
        // The SPA owns /auth/* pages (login, register, …) while Better Auth owns
        // the /auth/* API. Only proxy API calls; browser navigations fall
        // through to Vite's SPA fallback instead of being swallowed here.
        bypass: (req) => (req.headers.accept?.includes('text/html') ? (req.url ?? '/') : undefined),
      },
      '/api': {
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
});
