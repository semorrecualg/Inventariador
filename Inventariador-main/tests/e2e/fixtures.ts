import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixture with app-specific helpers.
 *
 * This SPA uses React Router v6 with HashRouter, with routes:
 *   /login  — Login page
 *   /contexto — Contrato de trabalho (escolha da filial)
 *   /db-manager — Gestor de Base (SRE; aparelho novo, base vazia)
 *   *       — Catch-all (renders BiometricRegistration, Register, or fallback)
 *
 * Helpers:
 * - loginAsAdmin() — logs in with default admin credentials, waits for the
 *   post-login screen: /contexto with a loaded base, /db-manager on a new device
 * - waitForAppReady() — waits for React SPA to mount in #root
 */
export const test = base.extend<{
  loginAsAdmin: () => Promise<void>;
  waitForAppReady: () => Promise<void>;
}>({
  loginAsAdmin: async ({ page }, use) => {
    await page.goto('/#/login');
    await page.waitForSelector('#root', { timeout: 10000 });

    // Fill credentials
    await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
    await page.getByPlaceholder('••••••••').fill('admin');
    await page.getByRole('button', { name: /Acessar Sistema/i }).click();

    // O pós-login depende do estado da base local: carregada → CONTRATO
    // DE TRABALHO (#/contexto); aparelho novo, base vazia → o SRE abre o
    // Gestor de Base (#/db-manager). O que nunca acontece é cair em /unit.
    await page.waitForURL(/\/(contexto|db-manager)/, { timeout: 15000 });
    expect(new URL(page.url()).hash).not.toContain('/unit');
    await use(async () => {});
  },

  waitForAppReady: async ({ page }, use) => {
    await page.waitForFunction(() => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    }, { timeout: 10000 });
    await use(async () => {});
  },
});

export { expect };
