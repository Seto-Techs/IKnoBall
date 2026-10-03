import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@iknoball/predictions': fileURLToPath(
        new URL('../../packages/predictions/src', import.meta.url),
      ),
      '@iknoball/schema': fileURLToPath(new URL('../../packages/schema/src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { reportsDirectory: 'coverage' },
  },
});
