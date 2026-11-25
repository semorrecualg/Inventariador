import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Carga mista no Gestor de Base → CONTRATO DE TRABALHO (unidade fundida).
 *
 * A planilha mistura linhas COM e SEM `tenantid` nas mesmas filiais. O
 * contrato SRE só exige que a coluna exista no índice 0 e que ao menos uma
 * linha traga valor — o resto pode vir vazio.
 *
 * O que se confirma no CONTRATO DE TRABALHO (`/contexto`), que herdou a
 * contagem por filial da antiga Unidade Operacional (`/unit`):
 *  - UM cartão por filial (não um por linha, nem um «SEM CONTRATO» a mais por
 *    causa das linhas sem tenantid);
 *  - a contagem por filial («N ATIVOS») e o total da secção são iguais ao
 *    número de linhas da planilha;
 *  - reimportar a MESMA planilha não cria cópias: continuam 2 cartões e N
 *    ativos.
 */

const CABECALHO = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
  'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
  'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
  'vlraquisic', 'sn1_recno', 'sn3_recno'
];

const FILIAL_GO = '010101 CICOPAL GO';
const FILIAL_PA = '010102 CICOPAL PA';

/** 6 linhas: GO com 2 tenantid + 1 vazio; PA com 1 tenantid + 2 vazios. */
const LINHAS: string[][] = [
  ['CICOPAL', FILIAL_GO, 'Em uso', 'ETQ-MISTA-1', '1', 'ATIVO MISTO 1', 'SER-1', '31/12/2025', '', 'Fornecedor XPTO', 'NF-1', 'A 1', 'REG-1', '', '', '', 'PK-MISTA-1', '', '1000', '1', '1'],
  ['CICOPAL', FILIAL_GO, 'Em uso', 'ETQ-MISTA-2', '1', 'ATIVO MISTO 2', 'SER-2', '31/12/2025', '', 'Fornecedor XPTO', 'NF-2', 'A 2', 'REG-2', '', '', '', 'PK-MISTA-2', '', '2000', '2', '2'],
  ['', FILIAL_GO, 'Em uso', 'ETQ-MISTA-3', '1', 'ATIVO MISTO 3', 'SER-3', '31/12/2025', '', 'Fornecedor XPTO', 'NF-3', 'A 3', 'REG-3', '', '', '', 'PK-MISTA-3', '', '3000', '3', '3'],
  ['CICOPAL', FILIAL_PA, 'Em uso', 'ETQ-MISTA-4', '1', 'ATIVO MISTO 4', 'SER-4', '31/12/2025', '', 'Fornecedor XPTO', 'NF-4', 'B 1', 'REG-4', '', '', '', 'PK-MISTA-4', '', '4000', '4', '4'],
  ['', FILIAL_PA, 'Em uso', 'ETQ-MISTA-5', '1', 'ATIVO MISTO 5', 'SER-5', '31/12/2025', '', 'Fornecedor XPTO', 'NF-5', 'B 2', 'REG-5', '', '', '', 'PK-MISTA-5', '', '5000', '5', '5'],
  ['', FILIAL_PA, 'Em uso', 'ETQ-MISTA-6', '1', 'ATIVO MISTO 6', 'SER-6', '31/12/2025', '', 'Fornecedor XPTO', 'NF-6', 'B 3', 'REG-6', '', '', '', 'PK-MISTA-6', '', '6000', '6', '6']
];

const TOTAL_DE_LINHAS = LINHAS.length;

const planilhaCsv = () =>
  [CABECALHO, ...LINHAS].map((linha) => linha.join(',')).join('\n');

/** Abre um ecrã da app pelo mesmo `pushScreen` que os botões usam. */
const abrirEcra = async (page: Page, ecra: string) => {
  await page.evaluate((destino) => {
    (window as unknown as { pushScreen: (screen: string) => void }).pushScreen(destino);
  }, ecra);
};

/** Carrega a planilha mista pelo input do botão «SELECIONAR E CARREGAR PLANILHA». */
const carregarPlanilha = async (page: Page) => {
  await expect(page.locator('#file-loader')).toBeAttached({ timeout: 20000 });
  await page.setInputFiles('#file-loader', {
    name: 'carga-mista.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(planilhaCsv(), 'utf-8')
  });

  // O log do Gestor de Base fecha a carga; só depois disto a base local tem
  // as linhas e a Unidade Operacional pode ser lida com confiança.
  await expect(
    page.getByText(new RegExp(`${TOTAL_DE_LINHAS} ativos injetados com sucesso`))
  ).toBeVisible({ timeout: 60000 });

  // Aviso de mudança para BASE LOCAL (só aparece quando o modo muda). O botão
  // já foi «OK» e hoje é «Confirmar». Espera-o aparecer — decidir num instante
  // deixava a camada modal aberta e o toque seguinte ficava bloqueado.
  await fecharAvisoBaseLocal(page);
};

/** Fecha o aviso «Operando na Base Local», esperando que ele monte/feche. */
const fecharAvisoBaseLocal = async (page: Page) => {
  const aviso = page.getByRole('heading', { name: /Operando na Base Local/i });
  await aviso.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  if (!(await aviso.isVisible().catch(() => false))) return;
  await page.getByRole('button', { name: /^(OK|Confirmar)$/ }).first().click();
  await aviso.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
};

/** Abre o CONTRATO DE TRABALHO e confere filiais, contagens e total. */
const confirmarUnidadeSemCopias = async (page: Page) => {
  await abrirEcra(page, 'WORK_CONTEXT_SELECTION');
  await page.waitForURL(/#\/contexto$/, { timeout: 15000 });

  // Admin global sem contrato no perfil: a tela abre no seletor de contrato e
  // só depois da escolha explícita mostra as filiais da base. O catálogo chega
  // depois do URL — esperar em vez de decidir no primeiro instante.
  const filiais = page.locator('[data-testid="filial-options"] > button');
  const contrato = page.getByRole('button', { name: /CICOPAL/ }).first();
  await expect
    .poll(
      async () => (await filiais.count()) > 0 || (await contrato.isVisible().catch(() => false)),
      { timeout: 20000 }
    )
    .toBe(true);

  if ((await filiais.count()) === 0) {
    // Um aviso tardio pode ter ficado por cima do seletor.
    const confirmarModal = page.getByRole('button', { name: /^(OK|Confirmar)$/ }).first();
    if (await confirmarModal.isVisible().catch(() => false)) await confirmarModal.click();
    await contrato.click();
  }

  // Um cartão por filial — as linhas sem tenantid não criam uma unidade extra.
  await expect(filiais).toHaveCount(2, { timeout: 20000 });
  await expect(page.getByText(FILIAL_GO, { exact: true })).toHaveCount(1);
  await expect(page.getByText(FILIAL_PA, { exact: true })).toHaveCount(1);

  // 3 linhas em cada filial, ainda que só algumas tragam tenantid.
  await expect(page.getByText(/3 ATIVOS/)).toHaveCount(2);

  // Resumo da secção: o total é o número de linhas da planilha.
  await expect(page.getByTestId('filial-summary')).toContainText(`${TOTAL_DE_LINHAS} ativos`);
};

/** Login do mestre local e entrada no Gestor de Base. */
const entrarNoGestorDeBase = async (page: Page) => {
  await page.goto('/#/login');
  await page.getByPlaceholder(/Digite seu usuário/).fill('admin');
  await page.getByPlaceholder('••••••••').fill('admin');
  await page.getByRole('button', { name: /Acessar Sistema/i }).click();

  // Aparelho novo (base vazia) → Gestor de Base. Se o pós-login parar no
  // contrato, o caminho para o Gestor é o mesmo `pushScreen` da app.
  await page.waitForURL(/\/(contexto|db-manager)/, { timeout: 20000 });
  if (!page.url().includes('/db-manager')) await abrirEcra(page, 'DATABASE_MANAGER');
};

test.describe('Carga mista — um cartão por filial e total do cabeçalho', () => {
  test('planilha com e sem tenantid mantém 2 cartões e o total igual às linhas', async ({ page }) => {
    await entrarNoGestorDeBase(page);
    await carregarPlanilha(page);
    await confirmarUnidadeSemCopias(page);
  });

  test('reimportar a mesma planilha não duplica cartões nem ativos', async ({ page }) => {
    await entrarNoGestorDeBase(page);
    await carregarPlanilha(page);
    await confirmarUnidadeSemCopias(page);

    // Volta ao Gestor de Base e carrega o MESMO ficheiro outra vez.
    await abrirEcra(page, 'DATABASE_MANAGER');
    await page.waitForURL(/#\/db-manager$/, { timeout: 15000 });
    await carregarPlanilha(page);

    // A carga é idempotente: um cartão por filial e o total da planilha, sem
    // uma segunda cópia de cada ativo.
    await confirmarUnidadeSemCopias(page);
  });
});
