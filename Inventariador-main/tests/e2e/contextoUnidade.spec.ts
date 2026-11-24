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
    // Esta spec NÃO faz login: `login.spec` e `loginContrato.spec` já o cobrem.
    // Semear a cópia persistida da sessão (o mecanismo real de retomar sessão,
    // `gbr_persisted_session`) tira do teste a corrida entre o login e a
    // checagem de sessão do arranque — a corrida que deixava a URL /contexto
    // sem ecrã e deu 3 falhas no run 45311049374. O que se testa aqui é o
    // contrato, não o formulário de entrada.
    await page.addInitScript(() => {
      localStorage.setItem('gbr_persisted_session', JSON.stringify({
        user: {
          id: 'e2e-admin',
          username: 'admin',
          name: 'Admin E2E',
          email: 'admin@e2e.local',
          role: 'ADMIN',
          tenantid: 'CICOPAL'
        },
        savedAt: Date.now()
      }));
    });

    await page.goto('/');

    // Com base vazia o arranque abre o Gestor; com base carregada, o contrato.
    // Esperar pela tela montada antes de navegar (a sessão já está reposta, por
    // isso não há mais nenhum logout a caminho).
    await page.waitForFunction(() => {
      const texto = document.getElementById('root')?.textContent || '';
      return texto.includes('Gestor de Base de Dados') || texto.includes('Contrato de Trabalho');
    }, { timeout: 20000 });

    await page.evaluate(() => {
      (window as unknown as { pushScreen: (screen: string) => void }).pushScreen(
        'WORK_CONTEXT_SELECTION'
      );
    });
    await page.waitForURL(/#\/contexto$/, { timeout: 15000 });

    // A sincronização automática pode terminar e abrir o aviso «Sincronização
    // Concluída» por cima do contrato (em CI a nuvem não devolve dados). O aviso é legítimo — fecha-se quando aparece, em vez de
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
