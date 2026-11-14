import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules'],
    // Garante localStorage/sessionStorage em memória (ver src/test/setup.ts).
    setupFiles: ['./src/test/setup.ts'],
    // A suíte corre sempre em modo INTERNAL: `getDatabaseMode` é avaliado no
    // import, por isso credenciais no shell mudavam o caminho testado.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
