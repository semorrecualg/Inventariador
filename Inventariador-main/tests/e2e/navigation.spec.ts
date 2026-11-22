import { test, expect } from './fixtures';

/**
 * Navigation & Routing — estado real da app.
 *
 * Rotas reais: `/login` (entrada), `/contexto` (contrato de trabalho — que
 * herdou a Unidade Operacional) e `/db-manager` (gestor de base, SRE). A rota
 * `/unit` foi retirada.
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

  test('a rota /unit foi retirada e cai na entrada', async ({ page }) => {
    await page.goto('/#/unit');
    // Sem sessão, o guard manda para a entrada; a antiga tela de unidade já
    // não existe — a escolha da filial vive no CONTRATO DE TRABALHO.
    await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible({ timeout: 15000 });
  });
});
