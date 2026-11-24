import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * The activity is a standalone React app, not part of the site: it is served
 * inside Discord's iframe and reaches the same backend the site does.
 *
 * The dev proxy makes `/api` same-origin while developing, which is what lets a
 * plain browser tab drive the app without CORS. Inside Discord the app lives on
 * a `discordsays.com` origin instead, so `VITE_API_URL` points at the real API
 * and the backend's CORS allow-list has to name that origin.
 */
const API_TARGET = process.env.VITE_API_URL ?? 'http://localhost:3000';

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
      // The activity's own dev server listens on a different port from the API,
      // so the backend is named rather than derived: `$PORT` here is this
      // server's port, not the backend's.
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Headshots and team logos are **not** proxied here. `patchUrlMappings`
      // rewrites an absolute `https://cdn.nba.com/...` to `/nba/...`, but only
      // inside Discord, and Discord's own edge serves that prefix from the
      // portal's `/nba` mapping. In a dev-token browser tab the rewrite never
      // runs, so the URL stays absolute and this proxy would never be reached.
      // A proxy here would only hide a missing portal mapping.
      '/auth': {
        target: API_TARGET,
        // Keep the browser's Host so the backend can resolve its public origin
        // from the request, exactly as the site's dev server does.
        changeOrigin: false,
      },
    },
  },
});
