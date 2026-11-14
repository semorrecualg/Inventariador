import { defineConfig } from 'vitest/config';

/**
 * A suíte corre em dois modos, selecionados por `TEST_DB_MODE`:
 * - ausente/`internal` (predefinição): credenciais vazias → `isInternalMode`;
 * - `supabase`: credenciais FICTÍCIAS mas válidas → exercita os caminhos
 *   `SUPABASE_PLUS` (é o que o CI corre na segunda passagem).
 *
 * `getDatabaseMode` é avaliado no import, por isso o modo tem de estar fixado
 * aqui: variáveis do shell nunca mudam o caminho testado.
 */
const MODO_NUVEM = process.env.TEST_DB_MODE === 'supabase';

const CREDENCIAIS_TESTE = MODO_NUVEM
  ? {
      VITE_SUPABASE_URL: 'https://ci-teste.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key-ficticia-do-ci',
    }
  : {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    };

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules'],
    // Garante localStorage/sessionStorage em memória (ver src/test/setup.ts).
    setupFiles: ['./src/test/setup.ts'],
    env: CREDENCIAIS_TESTE,
  },
});
