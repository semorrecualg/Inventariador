import { AppScreen } from '../types';

/**
 * Maps each AppScreen value to a URL path.
 * Lazy-loads every screen component for code-splitting.
 */
// Route config — ready for lazy imports in Phase 2
// Phase 2: screen-to-path mapping used by NavigationBridge
// When ready, replace each catch-all screen-switch with individual <Route path={screenToPath[s]}>
export const screenToPath: Record<AppScreen, string> = {
  [AppScreen.LOGIN]: '/login',
  [AppScreen.REGISTER]: '/register',
  [AppScreen.MAIN_MENU]: '/menu',
  [AppScreen.ASSET_DETAIL]: '/asset/',
  [AppScreen.DASHBOARD]: '/dashboard',
  [AppScreen.INVENTORY]: '/inventory',
  [AppScreen.LABELING]: '/labeling',
  [AppScreen.CONSULTATION]: '/consultation',
  [AppScreen.ADDRESS_SELECTION]: '/address',
  [AppScreen.USER_MANAGEMENT]: '/users',
  [AppScreen.CHANGE_PASSWORD]: '/change-password',
  [AppScreen.FIELD_CONFIGURATOR]: '/fields',
  [AppScreen.QR_CODE_CONFIGURATOR]: '/qr-config',
  [AppScreen.GLOBAL_PERFORMANCE]: '/performance',
  [AppScreen.ACCOUNT_RECONCILIATION]: '/reconciliation',
  [AppScreen.SIGNATURE]: '/signature',
  [AppScreen.DATABASE_MANAGER]: '/db-manager',
  [AppScreen.ASSET_MAP]: '/map',
  [AppScreen.ACTIVE_SEARCH]: '/search',
  [AppScreen.MODULE_SELECTION]: '/modules',
  [AppScreen.ASSET_CONTROL_HOME]: '/asset-control',
  [AppScreen.AUDIT_LOGS]: '/audit-logs',
  [AppScreen.CAMPAIGN_MANAGEMENT]: '/campaigns',
  [AppScreen.ONBOARDING]: '/onboarding',
  [AppScreen.BIOMETRIC_REGISTRATION]: '/biometric',
  [AppScreen.SYNC_MANAGER]: '/sync',
  [AppScreen.SOFT_DELETE_REPORT]: '/soft-delete',
  [AppScreen.IMPAIRMENT_REPORT]: '/impairment',
  [AppScreen.UNIT_CONFIGURATOR]: '/unit-config',
  [AppScreen.STRESS_TEST]: '/stress-test',
  [AppScreen.ASSET_REPORT_PRINT]: '/print',
  [AppScreen.LICENSE_PROVISIONING]: '/licenses',
  [AppScreen.TENANT_WORK_SELECTION]: '/selecionar-contrato',
  [AppScreen.LOAD_HISTORY]: '/load-history',
  [AppScreen.WORK_CONTEXT_SELECTION]: '/contexto',
};

/**
 * Caminho → tela: o inverso de `screenToPath`.
 *
 * Sem isto o hash da URL era só um espelho de escrita — um F5 em
 * `#/audit-logs` não tinha como voltar à trilha.
 */
export const pathToScreen: Record<string, AppScreen> = Object.fromEntries(
  (Object.entries(screenToPath) as [AppScreen, string][]).map(([screen, path]) => [path, screen])
) as Record<string, AppScreen>;

/**
 * Tela pedida por um hash (`#/audit-logs`, `#/contexto/`, `#/audit-logs?aba=x`,
 * `#/asset/<etiqueta>`), ou `null` quando não é uma rota conhecida.
 */
export function telaDoHash(hash: string): AppScreen | null {
  if (!hash) return null;
  const bruto = hash.startsWith('#') ? hash.slice(1) : hash;
  const caminho = bruto.split(/[?#]/)[0];
  if (!caminho || caminho === '/') return null;

  // `/asset/<etiqueta>` nunca aparece inteiro em `screenToPath`.
  const rotaDetalhe = screenToPath[AppScreen.ASSET_DETAIL];
  if (caminho.startsWith(rotaDetalhe)) return AppScreen.ASSET_DETAIL;

  const semBarraFinal = caminho.length > 1 ? caminho.replace(/\/+$/, '') : caminho;
  return pathToScreen[semBarraFinal] ?? null;
}

