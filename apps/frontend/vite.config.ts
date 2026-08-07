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
      },
      '/api': {
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
});
