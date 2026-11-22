import { test, expect } from './fixtures';

/**
 * Dashboard — estado real da app.
 *
 * O login não aterra no dashboard (vai ao Gestor de Base num aparelho novo ou
 * ao CONTRATO com base carregada), por isso cada teste navega explicitamente
 * para `#/dashboard`. Abas e cartões abaixo existem em
 * `src/components/Dashboard.tsx`.
 */
import type { Locator, Page } from '@playwright/test';

/** A aba «Unidades» — o último botão com esse nome acessível (o topo tem outro). */
const abaUnidades = (page: Page) =>
  page.getByRole('button', { name: 'Unidades', exact: true }).last();

/**
 * O overlay de reconexão da nuvem (`z-[20000]`) pode ficar por cima do ecrã no
 * CI e o `click()` do Playwright espera que ele saia; o evento é despachado no
 * próprio elemento, como o toque do utilizador faria. As asserções seguintes
 * continuam a verificar o efeito (URL, painel).
 */
const clicarNoElemento = async (alvo: Locator) => {
  await expect(alvo).toBeVisible({ timeout: 10000 });
  await alvo.evaluate((elemento) => (elemento as HTMLElement).click());
};

/** Cartão de ação rápida pelo título. */
const clicarNoCartao = async (page: Page, titulo: string) =>
  clicarNoElemento(page.getByText(titulo, { exact: true }).first());

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.goto('/#/dashboard');
    await expect(page.getByRole('button', { name: /Visão Geral/i })).toBeVisible({ timeout: 15000 });
  });

  test('should show dashboard tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Visão Geral/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Financeiro/i })).toBeVisible();
    // Há dois botões com o nome «Unidades»: o chip do topo (antes, no DOM) e a
    // aba (depois). A aba é a última.
    await expect(abaUnidades(page)).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await clicarNoElemento(page.getByRole('button', { name: /Financeiro/i }));
    await expect(page.getByText('Valor Total')).toBeVisible({ timeout: 5000 });

    await clicarNoElemento(abaUnidades(page));
    await expect(page.getByText(/Progresso por Unidade/)).toBeVisible({ timeout: 5000 });

    await clicarNoElemento(page.getByRole('button', { name: /Visão Geral/i }));
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
    // Sem filial escolhida, o cartão INVENTÁRIO leva à escolha de unidade no
    // CONTRATO DE TRABALHO (a antiga `/unit` foi fundida nele); com filial
    // escolhida, ao endereço físico.
    await clicarNoCartao(page, 'INVENTÁRIO');
    await page.waitForURL(/\/(contexto|address)/, { timeout: 10000 });
  });

  test('should leave the dashboard from the labeling quick action', async ({ page }) => {
    await clicarNoCartao(page, 'ETIQUETAR');
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
