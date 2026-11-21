import { test, expect } from './fixtures';

/**
 * Dashboard — estado real da app.
 *
 * O login não aterra no dashboard (vai ao Gestor de Base num aparelho novo ou
 * ao CONTRATO com base carregada), por isso cada teste navega explicitamente
 * para `#/dashboard`. Abas e cartões abaixo existem em
 * `src/components/Dashboard.tsx`.
 */
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.goto('/#/dashboard');
    await expect(page.getByRole('button', { name: /Visão Geral/i })).toBeVisible({ timeout: 15000 });
  });

  test('should show dashboard tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Visão Geral/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Financeiro/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unidades/i })).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await page.getByRole('button', { name: /Financeiro/i }).click();
    await expect(page.getByText('Valor Total')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Unidades/i }).click();
    await expect(page.getByText(/Progresso por Unidade/)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Visão Geral/i }).click();
    await expect(page.getByText('Eficiência de Inventário')).toBeVisible({ timeout: 5000 });
  });

  test('should show inventory KPIs', async ({ page }) => {
    await expect(page.getByText('Eficiência de Inventário')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Conferidos', { exact: true })).toBeVisible();
    await expect(page.getByText('Pendentes', { exact: true })).toBeVisible();
  });

  test('should display progress percentage', async ({ page }) => {
    await expect(page.locator('text=/\\d+%/').first()).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to inventory from quick action', async ({ page }) => {
    // Sem filial escolhida, o cartão INVENTÁRIO leva à escolha de unidade —
    // com filial escolhida, ao endereço físico.
    await page.getByText('INVENTÁRIO', { exact: true }).first().click();
    await page.waitForURL(/\/(unit|address)/, { timeout: 10000 });
  });

  test('should leave the dashboard from the labeling quick action', async ({ page }) => {
    await page.getByText('ETIQUETAR', { exact: true }).first().click();
    await page.waitForURL(/\/(labeling|address|unit|contexto)/, { timeout: 10000 });
  });

  test('should show recent activity section', async ({ page }) => {
    await expect(page.getByText('Atividade Recente')).toBeVisible({ timeout: 5000 });
  });

  test('should render charts', async ({ page }) => {
    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible({ timeout: 10000 });
  });

  test.describe('Status Distribution', () => {
    test('should show status distribution chart', async ({ page }) => {
      await expect(page.getByText('Distribuição por Status')).toBeVisible({ timeout: 5000 });
    });

    test('should show audit activity chart', async ({ page }) => {
      await expect(page.getByText('Atividade por Usuário')).toBeVisible({ timeout: 5000 });
    });
  });
});
