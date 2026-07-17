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

    test('login flow completes to menu navigation', async ({ page }) => {
      await page.goto('/#/login');
      await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
      await page.getByPlaceholder('••••••••').fill('admin');
      await page.getByRole('button', { name: /Acessar Sistema/i }).click();

      // After login, the app should navigate away from /login
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    });
  });

  test.describe('Public Routes', () => {
    test('database manager route renders without crashing', async ({ page }) => {
      await page.goto('/#/db-manager');
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
    });
  });
});
