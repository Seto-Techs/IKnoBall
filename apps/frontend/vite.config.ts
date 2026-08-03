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
        bypass(req) {
          // Let the SPA handle page navigations (browser requests with HTML Accept header)
          // API calls (fetch/XHR) pass through to the backend
          const accept = req.headers.accept ?? '';
          if (accept.includes('text/html')) return '/index.html';
        },
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
