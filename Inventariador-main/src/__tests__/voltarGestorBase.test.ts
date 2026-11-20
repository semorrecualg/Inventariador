/**
 * Contrato do «Voltar» do GESTOR DE BASE.
 *
 * A rota `/db-manager` tinha o regresso FIXO em
 * `pushScreen(AppScreen.MODULE_SELECTION)`: sair do Gestor de Base caía sempre
 * na tela legada `/modules` («Selecione o módulo de trabalho»), fora da trilha
 * única (contrato → hub → PAINEL COMPLETO) e em círculo para o auditor, cuja
 * `UNIT_SELECTION` é rebatida para o contrato pelo RouteGuard.
 *
 * Regra agora (uma só, `historicoAposVoltar`):
 *   - com histórico → recua um passo e devolve o PAINEL COMPLETO de onde veio;
 *   - sem histórico → ancora no CONTRATO DE TRABALHO;
 *   - `/modules` deixa de ser destino de «Voltar».
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AppScreen } from '../types';
import { screenToPath } from '../router/routes';
import { historicoAposVoltar, VOLTAR_SEM_HISTORICO } from '../utils/routingUtils';

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
const APP_TSX = ler('../App.tsx');
const DB_MGR = ler('../screens/DatabaseManagerScreen.tsx');
const LOAD_HISTORY = ler('../screens/LoadHistoryScreen.tsx');

describe('«Voltar» do Gestor de Base', () => {
  it('com histórico recua um passo — devolve o PAINEL COMPLETO de onde se veio', () => {
    const pilha = [
      AppScreen.LOGIN,
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.MAIN_MENU,
      AppScreen.DATABASE_MANAGER,
    ];
    expect(historicoAposVoltar(pilha)).toEqual([
      AppScreen.LOGIN,
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.MAIN_MENU,
    ]);
  });

  it('sem histórico ancora no CONTRATO DE TRABALHO, nunca em /modules', () => {
    expect(VOLTAR_SEM_HISTORICO).toBe(AppScreen.WORK_CONTEXT_SELECTION);
    expect(historicoAposVoltar([AppScreen.DATABASE_MANAGER])).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
    ]);
    expect(historicoAposVoltar([])).toEqual([AppScreen.WORK_CONTEXT_SELECTION]);
    // A raiz da trilha tem rota própria: o regresso não é o funil legado.
    expect(screenToPath[AppScreen.WORK_CONTEXT_SELECTION]).toBe('/contexto');
  });

  it('a rota /db-manager usa o mesmo regresso do resto da trilha (popScreen)', () => {
    const rota = APP_TSX.match(/<Route path="\/db-manager"[\s\S]*?\/>/);
    expect(rota).toBeTruthy();
    expect(rota![0]).toContain('onBack={popScreen}');
    expect(rota![0]).not.toContain('MODULE_SELECTION');
  });

  it('o popScreen não tem fallback próprio: usa a regra única', () => {
    const pop = APP_TSX.match(/const popScreen = useCallback\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/);
    expect(pop).toBeTruthy();
    expect(pop![0]).toContain('historicoAposVoltar(prev)');
    expect(pop![0]).not.toContain('AppScreen.MODULE_SELECTION');
  });

  it('os fallbacks internos das sub-telas do PAINEL COMPLETO apontam para a mesma raiz', () => {
    for (const fonte of [DB_MGR, LOAD_HISTORY]) {
      expect(fonte).toContain('VOLTAR_SEM_HISTORICO');
      expect(fonte).not.toContain('AppScreen.MODULE_SELECTION');
    }
  });
});
