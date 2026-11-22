// ============================================================================
// bootRedirects.ts — «Blindagem de base vazia».
//
// Com a base local vazia a app empurra o utilizador para a UNIDADE OPERACIONAL
// (o CONTRATO DE TRABALHO, onde a filial é cadastrada/carregada). Essa decisão vivia num `useEffect` do
// `App` como «tudo excepto esta lista», o que apanhava também ecrãs do percurso
// de entrada — o passo biométrico, por exemplo — e tornava o pós-login
// dependente do que corria primeiro: no browser o dono faz bypass e a base tem
// dados (fica no CONTRATO); num ambiente sem dono/base vazia o mesmo arranque
// podia acabar em `/unit`. Aqui a regra é explícita e testável.
// ============================================================================
import { AppScreen } from '../types';

/**
 * Ecrãs em que a ausência de dados NÃO justifica saltar para o contrato:
 * entrada, onboarding e o próprio seletor de contrato (onde a filial é
 * escolhida) resolvem a base vazia pelo fluxo, não por redireccionamento.
 */
export const EMPTY_BASE_EXEMPT_SCREENS: ReadonlySet<AppScreen> = new Set([
  AppScreen.LOGIN,
  AppScreen.REGISTER,
  AppScreen.CHANGE_PASSWORD,
  AppScreen.BIOMETRIC_REGISTRATION,
  AppScreen.DATABASE_MANAGER,
  AppScreen.LOAD_HISTORY,
  AppScreen.UNIT_CONFIGURATOR,
  AppScreen.CAMPAIGN_MANAGEMENT,
  AppScreen.MODULE_SELECTION,
  AppScreen.ASSET_CONTROL_HOME,
  AppScreen.TENANT_WORK_SELECTION,
  AppScreen.USER_MANAGEMENT,
  AppScreen.MAIN_MENU,
  AppScreen.WORK_CONTEXT_SELECTION,
  AppScreen.FIELD_CONFIGURATOR,
  AppScreen.QR_CODE_CONFIGURATOR,
  AppScreen.LICENSE_PROVISIONING,
  AppScreen.AUDIT_LOGS
]);

export interface EmptyBaseContext {
  /** A base do contrato não tem ativos carregados. */
  vazio: boolean;
  /** O dono global nunca é empurrado para a unidade por base vazia. */
  dono: boolean;
}

/** `true` quando a base vazia deve forçar a ida à UNIDADE OPERACIONAL. */
export function shouldForceUnitOnEmptyBase(
  screen: AppScreen,
  { vazio, dono }: EmptyBaseContext
): boolean {
  if (!vazio || dono) return false;
  return !EMPTY_BASE_EXEMPT_SCREENS.has(screen);
}
