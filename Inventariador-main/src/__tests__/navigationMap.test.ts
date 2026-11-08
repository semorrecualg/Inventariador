/**
 * Teste de contrato de navegação — valida o mapa canônico documentado em
 * `docs/FLOW_GRAPH.md`:
 *
 * 1) Todo `AppScreen` possui rota em `screenToPath` (router/routes.tsx);
 * 2) Nenhuma rota é duplicada (zero colisões de URL);
 * 3) Todo `AppScreen` é referenciado no `App.tsx` (zero telas órfãs sem render);
 * 4) As telas órfãs consolidadas (`SETTINGS`, `QR_CONFIGURATOR`) não existem mais;
 * 5) Os 34 nós do grafo de negócio estão cobertos pelo enum.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AppScreen } from '../types';
import { screenToPath } from '../router/routes';

const APP_TSX = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf-8');

/** Nós do grafo (docs/FLOW_GRAPH.md) → valores do enum AppScreen. */
const GRAPH_NODES: string[] = [
  'LOGIN',
  'REGISTER',
  'BIOMETRIC_REGISTRATION',
  'CHANGE_PASSWORD',
  'STRESS_TEST',
  'MODULE_SELECTION',
  'ASSET_CONTROL_HOME',
  'UNIT_SELECTION',
  'DATABASE_MANAGER',
  'DASHBOARD',
  'MAIN_MENU',
  'ADDRESS_SELECTION',
  'INVENTORY',
  'LABELING',
  'ACTIVE_SEARCH',
  'CONSULTATION',
  'ASSET_MAP',
  'ASSET_DETAIL',
  'SIGNATURE',
  'ASSET_REPORT_PRINT',
  'CAMPAIGN_MANAGEMENT',
  'UNIT_CONFIGURATOR',
  'USER_MANAGEMENT',
  'FIELD_CONFIGURATOR',
  'QR_CODE_CONFIGURATOR',
  'AUDIT_LOGS',
  'GLOBAL_PERFORMANCE',
  'ACCOUNT_RECONCILIATION',
  'SOFT_DELETE_REPORT',
  'IMPAIRMENT_REPORT',
  'SYNC_MANAGER',
  'ONBOARDING',
  'TENANT_WORK_SELECTION',
  'LOAD_HISTORY',
];

describe('Contrato de navegação (docs/FLOW_GRAPH.md)', () => {
  it('todo AppScreen possui rota em screenToPath', () => {
    const missing = Object.values(AppScreen).filter((s) => !screenToPath[s]);
    expect(missing).toEqual([]);
  });

  it('rotas são únicas — zero colisões de URL', () => {
    const paths = Object.values(screenToPath);
    const duplicates = paths.filter((p, i) => paths.indexOf(p) !== i);
    expect(duplicates).toEqual([]);
  });

  it('todo AppScreen é referenciado no App.tsx — zero telas órfãs', () => {
    const orphans = Object.values(AppScreen).filter((s) => !APP_TSX.includes(`AppScreen.${s}`));
    expect(orphans).toEqual([]);
  });

  it('telas órfãs consolidadas (SETTINGS, QR_CONFIGURATOR) não existem mais', () => {
    expect(Object.values(AppScreen)).not.toContain('SETTINGS');
    expect(Object.values(AppScreen)).not.toContain('QR_CONFIGURATOR');
    // '/qr-config' permanece como rota única da tela viva QR_CODE_CONFIGURATOR
    // (a colisão anterior era a duplicação via QR_CONFIGURATOR).
    const qrConfigPaths = Object.values(screenToPath).filter((p) => p === '/qr-config');
    expect(qrConfigPaths).toHaveLength(1);
  });

  it('o RouteGuard de inicialização não rebate a trilha para /unit', () => {
    // Bug real: /contexto (contrato) não estava na lista de telas liberadas e o
    // guard (que exige `selectedUnit`) mandava todo mundo para a Unidade
    // Operacional logo após o login — e de novo a cada "trocar filial".
    const block = APP_TSX.match(/const publicScreens = \[([\s\S]*?)\];/);
    expect(block).toBeTruthy();
    expect(block![1]).toContain('AppScreen.WORK_CONTEXT_SELECTION');
    // O hub é a outra tela que existe antes de unidade ativa.
    expect(APP_TSX).toContain('screen !== AppScreen.MAIN_MENU');
  });

  it('o "Sair" do hub volta para o contrato, não para a Unidade Operacional', () => {
    const tag = APP_TSX.match(/<MainMenu[\s\S]*?onLogout=\{([^}]*\}\})/);
    expect(tag).toBeTruthy();
    expect(tag![1]).toContain('pushScreen(AppScreen.WORK_CONTEXT_SELECTION)');
  });

  it('os 34 nós do grafo estão cobertos pelo enum', () => {
    const enumValues = Object.values(AppScreen) as string[];
    const missing = GRAPH_NODES.filter((n) => !enumValues.includes(n));
    expect(missing).toEqual([]);
  });
});
