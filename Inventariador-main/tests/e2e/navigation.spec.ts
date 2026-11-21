import { test, expect } from './fixtures';

/**
 * Navigation & Routing — estado real da app.
 *
 * Rotas reais: `/login` (entrada), `/contexto` (contrato de trabalho),
 * `/db-manager` (gestor de base, SRE). Um perfil autenticado nunca deve
 * aterrar em `/unit` logo após o login.
 */
test.describe('Navigation & Routing', () => {
  test('should render the App shell and mount React', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
  });

  test('should navigate to login page and show access button', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByRole('button', { name: /Acessar Sistema/i })).toBeVisible({ timeout: 15000 });
  });

  test('should handle unknown routes gracefully', async ({ page }) => {
    await page.goto('/#/nonexistent-route');
    // O catch-all mantém a shell montada, sem ecrã vazio.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10000 });
  });

  test('should show privacy center option on login page', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByRole('button', { name: /Privacidade/i })).toBeVisible({ timeout: 15000 });
  });

  test('should not route an unauthenticated visitor to the unit screen', async ({ page }) => {
    await page.goto('/#/unit');
    // Sem sessão, o guard manda para a entrada; o ecrã de unidade não é o destino.
    await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible({ timeout: 15000 });
  });
});
