import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixture with app-specific helpers.
 *
 * This SPA uses React Router v6 with HashRouter, with routes:
 *   /login  — Login page
 *   /menu   — Main menu (requires auth)
 *   /dashboard — Dashboard (requires auth)
 *   *       — Catch-all (renders BiometricRegistration, Register, or fallback)
 *
 * Helpers:
 * - loginAsAdmin() — logs in with default admin credentials, waits for /menu
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

    // Wait for navigation away from login — the app may navigate to /menu or another auth route
    await page.waitForURL(/\/(menu|dashboard|unit)/, { timeout: 15000 });
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
