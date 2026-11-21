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

  test('admin autenticado nunca aterra na unidade', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
    await page.getByPlaceholder('••••••••').fill('admin');
    await page.getByRole('button', { name: /Acessar Sistema/i }).click();

    // Num aparelho novo a base local está vazia: o SRE abre o Gestor de Base
    // para vincular/importar; com base carregada, o login aterra no CONTRATO.
    // O que o login nunca pode fazer é desviar para a UNIDADE.
    await page.waitForURL(/(db-manager|contexto)/, { timeout: 20000 });
    expect(new URL(page.url()).hash).not.toContain('/unit');
  });
});
