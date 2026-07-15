import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, loginAsAdmin }) => {
    // First log in to establish auth session
    await loginAsAdmin();
  });

  test('should show dashboard header with navigation', async ({ page }) => {
    await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Visão Geral/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Financeiro/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unidades/i })).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Click financial tab
    await page.getByRole('button', { name: /Financeiro/i }).click();
    await expect(page.locator('text=Valor Total')).toBeVisible({ timeout: 5000 });

    // Click units tab
    await page.getByRole('button', { name: /Unidades/i }).click();
    await expect(page.locator('text=Progresso por Unidade')).toBeVisible({ timeout: 5000 });

    // Switch back to overview
    await page.getByRole('button', { name: /Visão Geral/i }).click();
    await expect(page.locator('text=Eficiência de Inventário')).toBeVisible({ timeout: 5000 });
  });

  test('should show inventory KPIs', async ({ page }) => {
    await page.getByRole('button', { name: /Visão Geral/i }).click();
    await expect(page.locator('text=Eficiência de Inventário')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Conferidos')).toBeVisible();
    await expect(page.locator('text=Pendentes')).toBeVisible();
  });

  test('should display progress percentage', async ({ page }) => {
    await page.getByRole('button', { name: /Visão Geral/i }).click();
    // Progress percentage should show somewhere on the dashboard
    const percentage = page.locator('text=/\\d+%/');
    await expect(percentage).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to inventory from quick action', async ({ page }) => {
    const inventoryBtn = page.locator('text=INVENTÁRIO').first();
    await inventoryBtn.click();

    // Should navigate to address selection or inventory screen
    await page.waitForURL(/\/(?:inventory|address)/, { timeout: 10000 });
  });

  test('should navigate to labeling from quick action', async ({ page }) => {
    const labelingBtn = page.locator('text=ETIQUETAR').first();
    await labelingBtn.click();

    await page.waitForURL(/labeling/, { timeout: 10000 });
  });

  test('should show recent activity section', async ({ page }) => {
    const activitySection = page.locator('text=Atividade Recente');
    await expect(activitySection).toBeVisible({ timeout: 5000 });

    // Should show either activity entries or "no activity" message
    const noActivity = page.locator('text=Nenhuma atividade registrada');
    const activityEntry = page.locator('.space-y-4 > div').first();
    await expect(noActivity.or(activityEntry)).toBeVisible({ timeout: 5000 });
  });

  test('should render charts', async ({ page }) => {
    const charts = page.locator('.recharts-responsive-container');
    await expect(charts.first()).toBeVisible({ timeout: 10000 });
  });

  test.describe('Status Distribution', () => {
    test('should show status distribution chart', async ({ page }) => {
      await expect(page.locator('text=Distribuição por Status')).toBeVisible({ timeout: 5000 });
    });

    test('should show audit activity chart', async ({ page }) => {
      await expect(page.locator('text=Atividade por Usuário')).toBeVisible({ timeout: 5000 });
    });
  });
});
