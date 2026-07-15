import { test, expect } from './fixtures';

test.describe('Navigation & Routing', () => {
  test('should render the App shell and mount React', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
  });

  test('should navigate to login page and show access button', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByText(/Acessar Sistema/i)).toBeVisible({ timeout: 10000 });
  });

  test('should handle unknown routes gracefully', async ({ page }) => {
    await page.goto('/#/nonexistent-route');
    // The catch-all should still render the app shell without errors
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
  });

  test('should show privacy center option on login page', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByRole('button', { name: /Privacidade/i })).toBeVisible({
      timeout: 5000,
    });
  });
});
