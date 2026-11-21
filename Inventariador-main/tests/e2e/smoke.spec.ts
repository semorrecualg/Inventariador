import { test, expect } from './fixtures';

/**
 * Smoke tests — quick health checks that validate the app boots up
 * and all major routes render without crashing.
 *
 * These run across all browser projects (Chromium, Firefox, WebKit,
 * mobile Chrome, mobile Safari) to catch cross-browser issues fast.
 */
test.describe('App Smoke Tests', () => {
  test.describe('App Shell', () => {
    test('should mount React app into #root', async ({ page }) => {
      await page.goto('/#/login');
      const root = page.locator('#root');
      await expect(root).toBeAttached({ timeout: 10000 });
      await expect(root).not.toBeEmpty();
    });

    test('should not have console errors on initial load', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto('/#/login');
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });

      // Filter out expected 3rd-party / dev-server noise
      const appErrors = consoleErrors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('chrome-extension') &&
          !e.includes('Failed to load resource') &&
          !e.includes('WebSocket') &&
          !e.includes('vite') &&
          !e.includes('HMR') &&
          !e.includes('ResizeObserver') &&
          !e.includes('Script error.')
      );
      expect(appErrors).toEqual([]);
    });

    test('should not trigger unhandled page errors on login route', async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto('/#/login');
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });

      expect(pageErrors).toEqual([]);
    });
  });

  test.describe('Critical Routes', () => {
    test('login route renders form without crashing', async ({ page }) => {
      await page.goto('/#/login');
      await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByPlaceholder('••••••••')).toBeVisible();
      await expect(page.getByRole('button', { name: /Acessar Sistema/i })).toBeVisible();
    });

    test('unknown route renders app shell catch-all without crashing', async ({ page }) => {
      await page.goto('/#/some-random-nonexistent-route');
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
    });

    test('login flow leaves the login screen for the base manager or the contract', async ({ page }) => {
      await page.goto('/#/login');
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // Aparelho novo (base vazia) → Gestor de Base; base carregada → CONTRATO.
      // O que o login nunca pode fazer é desviar para a unidade.
      await expect(page).toHaveURL(/\/(contexto|db-manager)/, { timeout: 15000 });
      expect(new URL(page.url()).hash).not.toContain('/unit');
    });
  });

  test.describe('Public Routes', () => {
    test('database manager route renders without crashing', async ({ page }) => {
      await page.goto('/#/db-manager');
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
    });
  });
});
