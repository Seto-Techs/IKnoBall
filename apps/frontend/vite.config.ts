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
    // Orb portals are served from hostnames Amp assigns per thread or from a
    // custom portal hostname, so the dev server cannot predict them. Amp sets
    // AMP_ORB inside an orb; never relax this outside one.
    allowedHosts: process.env.AMP_ORB ? true : undefined,
    proxy: {
      '/auth': {
        target: process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
        // Keep the browser's Host so the backend can resolve its public origin
        // from the request. Better Auth uses it to build OAuth redirect URIs,
        // which must match the hostname the browser is actually on.
        changeOrigin: false,
        // The SPA owns /auth/* pages (login, register, …) while Better Auth owns
        // the /auth/* API. Only proxy API calls; browser navigations fall
        // through to Vite's SPA fallback instead of being swallowed here.
        //
        // OAuth callbacks are the exception: the provider redirects the browser
        // straight to them, so they arrive as navigations but must still reach
        // Better Auth. Falling through would render the SPA and drop the code.
        bypass: (req) => {
          const url = req.url ?? '/';
          if (url.startsWith('/auth/callback/') || url.startsWith('/auth/oauth2/callback/')) {
            return undefined;
          }
          return req.headers.accept?.includes('text/html') ? url : undefined;
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
