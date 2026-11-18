// @vitest-environment jsdom
// ============================================================================
// backgroundSyncGate.test.ts — o ciclo de fundo não pode morrer com a WebView.
//
// O temporizador de 60 s exigia `sessionStorage.getItem('filial')`. No Android o
// `sessionStorage` desaparece quando o sistema mata a WebView em segundo plano;
// o ecrã continua a mostrar a unidade (lê o `localStorage`), mas o ciclo saía em
// silêncio e nada subia — as etiquetas ficavam «Pendente Nuvem · base por
// espelhar» durante horas (004229/004231 em 2026-11-18).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shouldRunBackgroundSync } from '../utils/backgroundSync';

describe('shouldRunBackgroundSync', () => {
  it('corre com sessão válida mesmo com o sessionStorage vazio', () => {
    // O reinício da WebView esvazia a filial da sessão...
    sessionStorage.clear();
    expect(sessionStorage.getItem('filial')).toBeNull();

    // ...e a unidade continua visível no ecrã: o ciclo tem de correr.
    expect(shouldRunBackgroundSync({ tenantid: 'CICOPAL' })).toBe(true);
  });

  it('não corre sem sessão ou sem contrato', () => {
    expect(shouldRunBackgroundSync(null)).toBe(false);
    expect(shouldRunBackgroundSync(undefined)).toBe(false);
    expect(shouldRunBackgroundSync({ tenantid: '' })).toBe(false);
    expect(shouldRunBackgroundSync({ tenantid: '   ' })).toBe(false);
  });
});

describe('App.tsx — a barreira do ciclo de fundo', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  const inicio = fonte.indexOf('const triggerBackgroundSync');
  const fim = fonte.indexOf('setInterval(triggerBackgroundSync, 60000)', inicio);
  const bloco = fonte.slice(inicio, fim === -1 ? undefined : fim);

  it('usa o predicado sem filial e não exige o sessionStorage', () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(bloco).toContain('shouldRunBackgroundSync(user)');
    expect(bloco).not.toContain("sessionStorage.getItem('filial')");
  });
});
