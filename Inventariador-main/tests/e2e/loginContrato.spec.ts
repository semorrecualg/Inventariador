import { test, expect } from './fixtures';

/**
 * Login no CONTRATO DE TRABALHO — o caminho que o fixture exige.
 *
 * Corre no CI (`e2e-login`) sobre o build de produção com `@playwright/test`.
 * A credencial `admin`/`admin` é o acesso de mestre local previsto pelo
 * `Login.tsx`, por isso não depende de Supabase nem de base semeada.
 */
test.describe('Login no contrato de trabalho', () => {
  test('a entrada mostra utilizador, senha e o botão de acesso', async ({ page }) => {
    await page.goto('/#/login');

    await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: /Acessar Sistema/i })).toBeVisible();
  });

  test('admin autenticado aterra no CONTRATO e nunca na unidade', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
    await page.getByPlaceholder('••••••••').fill('admin');
    await page.getByRole('button', { name: /Acessar Sistema/i }).click();

    await page.waitForURL(/\/contexto/, { timeout: 20000 });
    expect(new URL(page.url()).hash).not.toContain('/unit');
    await expect(page.getByText(/Contrato de Trabalho/i).first()).toBeVisible({ timeout: 10000 });
  });
});
