import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules'],
    // Em ambiente jsdom devolve ao `globalThis` o localStorage do jsdom, que um
    // Node com webstorage ligado tapava (ver src/test/setup.ts).
    setupFiles: ['./src/test/setup.ts'],
  },
});
