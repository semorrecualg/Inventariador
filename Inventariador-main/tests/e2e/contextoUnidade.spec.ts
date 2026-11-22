import { test, expect } from './fixtures';

/**
 * FUSÃO DA UNIDADE OPERACIONAL NO CONTRATO DE TRABALHO.
 *
 * A tela administrativa `/unit` (UnitSelector) deixou de existir: a contagem de
 * ativos por filial, a geocerca, a carga de base e a sincronização passaram para
 * `/contexto` (WorkContextSelector), que é a única porta para escolher a
 * filial — inclusive para o auditor.
 */
test.describe('Contrato de trabalho — unidade fundida', () => {
  test('a rota /unit deixou de existir', async ({ page }) => {
    await page.goto('/#/unit');

    // Sem sessão, o guard manda para a entrada; a antiga tela não é destino.
    await expect(page.getByPlaceholder(/Digite seu usuário/)).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).hash).not.toContain('/unit');
  });

  test('o contrato concentra a escolha da unidade e as entradas operacionais', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
    await page.getByPlaceholder('••••••••').fill('admin');
    await page.getByRole('button', { name: /Acessar Sistema/i }).click();

    // Aparelho novo → Gestor de Base; base carregada → contrato. Em qualquer
    // dos casos, o contrato é alcançável pelo mesmo pushScreen dos botões.
    await page.waitForURL(/\/(contexto|db-manager)/, { timeout: 20000 });
    await page.evaluate(() => {
      (window as unknown as { pushScreen: (screen: string) => void }).pushScreen(
        'WORK_CONTEXT_SELECTION'
      );
    });
    await page.waitForURL(/#\/contexto$/, { timeout: 15000 });

    // A sincronização automática pode terminar DEPOIS da navegação e abrir o
    // aviso «Sincronização Concluída» por cima do contrato (em CI a nuvem não
    // devolve dados). O aviso é legítimo — fecha-se quando aparece, em vez de
    // deixar o teste depender do instante em que o sync termina.
    const contrato = page.getByText('Contrato de Trabalho', { exact: true });
    const confirmarAviso = page.getByRole('button', { name: 'Confirmar' });
    await expect
      .poll(
        async () => {
          if (await confirmarAviso.isVisible().catch(() => false)) {
            await confirmarAviso.click().catch(() => {});
          }
          return contrato.isVisible().catch(() => false);
        },
        { timeout: 15000, intervals: [250, 500, 1000] }
      )
      .toBe(true);

    // Título e secção da unidade, agora dentro do contrato.
    await expect(contrato).toBeVisible();
    await expect(page.getByText('Filial · Unidade Operacional')).toBeVisible();

    // A contagem por filial é a leitura que veio da tela retirada.
    const filiais = page.locator('[data-testid="filial-options"] > button');
    if ((await filiais.count()) > 0) {
      await expect(page.getByTestId('filial-summary')).toContainText('ativos');
    }

    expect(new URL(page.url()).hash).not.toContain('/unit');
  });
});
