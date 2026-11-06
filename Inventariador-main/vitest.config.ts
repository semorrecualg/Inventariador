import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules'],
    // Node >= 22.4 expõe `localStorage`/`sessionStorage` experimentais como globais.
    // O valor de `localStorage` fica `undefined` sem `--localstorage-file` e, por já
    // existir em `globalThis`, impede o jsdom de registrar o seu — em Vitest `window`
    // É `globalThis`, então `localStorage` some para os testes com pragma jsdom.
    // Desligar o Web Storage experimental devolve a implementação ao jsdom.
    execArgv: ['--no-experimental-webstorage'],
  },
});
