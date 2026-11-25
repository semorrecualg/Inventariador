import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * SELETOR «MODO DE BASE» — fluxo fluido, offline-first e cartões passivos.
 *
 * Semeia a sessão persistida (o mesmo mecanismo de retomar sessão do arranque)
 * para não depender da corrida do login, e abre o Painel Completo pelo mesmo
 * `pushScreen` que os botões usam.
 */

type Modo = 'INTERNAL' | 'SUPABASE';

const semear = async (page: Page, opcoes: { mode: Modo; locked: boolean }) => {
  await page.addInitScript(({ mode, locked }) => {
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
    localStorage.setItem('app_database_mode', mode);
    if (locked) {
      localStorage.setItem('is_system_locked', 'true');
      localStorage.setItem('gbr_integrity_key', 'GBR-AES256-SHA512::KARDEX_CONF_LOCKED_0_E2E');
    } else {
      localStorage.removeItem('is_system_locked');
      localStorage.removeItem('gbr_integrity_key');
    }
  }, opcoes);
};

const abrirGestaoDeBase = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof (window as unknown as { pushScreen?: unknown }).pushScreen === 'function',
    { timeout: 20000 }
  );

  // A porta real do PAINEL COMPLETO é o botão do CONTRATO DE TRABALHO —
  // entrar em MAIN_MENU directo redirecciona para o contrato sem unidade.
  await page.evaluate(() => {
    (window as unknown as { pushScreen: (s: string, p?: unknown) => void })
      .pushScreen('WORK_CONTEXT_SELECTION');
  });
  await page.waitForURL(/#\/contexto$/, { timeout: 15000 });

  await page.getByRole('button', { name: /Painel completo/i }).click();
  await expect(page.getByText('Gestão e Manutenção')).toBeVisible({ timeout: 15000 });
  await page.getByText('Gestão e Manutenção').click();
  await expect(page.getByText('Configuração e Ações do Utilizador')).toBeVisible({ timeout: 15000 });
};

test.describe('Modo de Base — offline-first e cartões passivos', () => {
  test('blindado: cartões sem botões técnicos e badge PROTEGIDO', async ({ page }) => {
    await semear(page, { mode: 'INTERNAL', locked: true });
    await abrirGestaoDeBase(page);

    await expect(page.getByText('PROTEGIDO')).toBeVisible();
    await expect(page.getByText('VALIDAR SOBERANIA')).toHaveCount(0);
    await expect(page.getByText('Desbloquear blindagem')).toHaveCount(0);
  });

  test('offline: Base Oficial é recusada e a blindagem fica intacta', async ({ page }) => {
    await semear(page, { mode: 'INTERNAL', locked: true });
    await abrirGestaoDeBase(page);

    await page.context().setOffline(true);
    const baseOficial = page.getByRole('button', { name: /Base Oficial/ });
    test.skip(await baseOficial.isDisabled(), 'build E2E sem chaves do Supabase');

    await baseOficial.click();

    await expect(page.getByText(/Você está sem internet/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Sem internet', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('is_system_locked'))).toBe('true');
    expect(await page.evaluate(() => localStorage.getItem('app_database_mode'))).toBe('INTERNAL');
  });

  test('online: Base Oficial blindada pede UM modal e desbloqueia na sequência', async ({ page }) => {
    await semear(page, { mode: 'INTERNAL', locked: true });
    // A nuvem não é o alvo: abortar as chamadas mantém a troca rápida e local.
    await page.route(/supabase/i, (route) => route.abort());
    await abrirGestaoDeBase(page);

    await page.getByRole('button', { name: /Base Oficial/ }).click();

    const confirmar = page.getByRole('button', { name: 'Conectar', exact: true });
    if (!(await confirmar.isVisible().catch(() => false))) {
      test.skip(true, 'build E2E sem chaves do Supabase');
    }

    await expect(page.getByText(/blindagem local/i)).toBeVisible();
    await confirmar.click();

    await page.waitForFunction(
      () => localStorage.getItem('app_database_mode') === 'SUPABASE'
        && localStorage.getItem('is_system_locked') === null,
      { timeout: 30000 }
    );
    expect(await page.evaluate(() => localStorage.getItem('gbr_integrity_key'))).toBeNull();
  });

  test('Base Local sela o aparelho automaticamente (sem clique extra)', async ({ page }) => {
    await semear(page, { mode: 'SUPABASE', locked: false });
    await abrirGestaoDeBase(page);

    const badgeOficial = page.locator('span', { hasText: 'Base Oficial' }).last();
    test.skip(!(await badgeOficial.isVisible().catch(() => false)), 'arranque não abriu em Base Oficial');

    await page.getByRole('button', { name: /Base Local/ }).click();

    await expect(page.getByText('Modo Alterado')).toBeVisible({ timeout: 30000 });
    await page.waitForFunction(
      () => localStorage.getItem('is_system_locked') === 'true'
        && (localStorage.getItem('gbr_integrity_key') || '').includes('KARDEX_CONF_LOCKED'),
      { timeout: 15000 }
    );
  });
});
