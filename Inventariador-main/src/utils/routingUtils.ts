import { AppModule, AppScreen, UserRole } from '../types';
import { sqliteService } from '../services/sqliteService';
import { isAdminEmail } from './authUtils';
import { logger } from './logger';

export interface SupabaseUserProfile {
  userId: string;
  email: string;
  role: UserRole;
  tenantid: string | null; 
}

export async function processarRoteamentoPosLoginSaas(
  user: SupabaseUserProfile, 
  navigate: (path: string) => void | Promise<void>
): Promise<void> {
  logger.info(`[GBR v2.6] Analisando regras de acesso seguras para: ${user.email}`);

  // 1. Sandbox de Demonstração (DEMO) com bypass antecipado
  if (user.role === 'DEMO' || String(user.role).toUpperCase() === 'DEMO') {
    logger.info("[GBR v2.6] Inicializando Sandbox de Demonstração Livre.");
    sessionStorage.setItem('gbr_session_mode', 'DEMO');
    navigate('/dashboard-demo');
    return;
  }

  // 2. Validação de Segurança de Perfil Corporativo
  if (String(user.role).toUpperCase() === 'MASTER' && !user.tenantid) {
    logger.error("[GBR v2.6] Bloqueio de Segurança: MASTER sem tenantid.");
    throw new Error("Erro de consistência: Perfil MASTER sem empresa vinculada.");
  }

  // SRE ISOLAMENTO: a contagem que decide o roteamento é escopada ao tenant do
  // usuário. Sem isso, um MASTER de um tenant novo (ex.: CLIENTETESTE) herdaria
  // a contagem global (ex.: dados do CICOPAL em cache local) e cairia no fluxo
  // de "base preenchida" em vez de ser direcionado à primeira carga de dados.
  const totalAtivosLocal = user.tenantid
    ? await sqliteService.countAtivosByTenant(user.tenantid).catch(() => 0)
    : await sqliteService.countAtivos().catch(() => 0);
  const isSuperAdmin = isAdminEmail(user.email);
  const isMaster = String(user.role).toUpperCase() === 'MASTER';

  // 3. Fluxo para Base Totalmente Vazia (Lote 0)
  if (totalAtivosLocal === 0) {
    if (isSuperAdmin || isMaster) {
      logger.info("[Bootstrap] Base vazia. Redirecionando Admin para Carga Inicial.");
      navigate('/load-database');
    } else {
      logger.warn("[Bootstrap] Auditor retido: Banco local vazio. Aguardando provisionamento do Admin.");
      navigate('/auditor/aguardando-carga');
    }
    return;
  }

  // 4. Fluxo para Base Já Preenchida (Cenário de Soberania Móvel)
  if (totalAtivosLocal > 0) {
    if (isSuperAdmin) {
      // Alvo de correção do travamento: O admin NUNCA é bloqueado por dados existentes
      sessionStorage.setItem('gbr_admin_scope', 'GLOBAL_SUPER_ADMIN');
      navigate('/saas/painel-global');
    } else if (isMaster) {
      sessionStorage.setItem('gbr_admin_scope', 'TENANT_MASTER');
      if (user.tenantid) {
        sessionStorage.setItem('gbr_active_tenant', user.tenantid);
      }
      navigate('/admin/painel-controle');
    } else {
      // Para auditores, os dados locais comandam. Força seleção de filial.
      navigate('/auditor/selecionar-filial');
    }
    return;
  }
}

/**
 * Resolve a tela de destino APÓS a escolha de um contexto de trabalho
 * (contrato + filial) no seletor pós-login. Reusa as mesmas regras de
 * isolamento por tenant do roteamento padrão, com um atalho operacional:
 * auditores com base preenchida vão DIRETO ao hub da filial (MAIN_MENU),
 * sem repetir a seleção de unidade — a filial já foi escolhida no seletor.
 */
export async function resolvePostSelectionScreen(
  user: Pick<SupabaseUserProfile, 'email' | 'role'> & { tenantid?: string | null }
): Promise<AppScreen> {
  const role = String(user.role || '').toUpperCase();
  if (role === 'DEMO') return AppScreen.DASHBOARD;

  const totalAtivosLocal = user.tenantid
    ? await sqliteService.countAtivosByTenant(user.tenantid).catch(() => 0)
    : await sqliteService.countAtivos().catch(() => 0);

  const isSuperAdmin = isAdminEmail(user.email);
  const isMaster = role === 'MASTER';

  // Base vazia para o contrato escolhido → primeira carga (ou aguardar admin)
  if (totalAtivosLocal === 0) {
    if (isSuperAdmin || isMaster) return AppScreen.DATABASE_MANAGER;
    return AppScreen.MODULE_SELECTION;
  }

  // Base preenchida → painel para admin/master, hub direto para auditor
  if (isSuperAdmin || isMaster || role === 'ADMIN') return AppScreen.MODULE_SELECTION;
  return AppScreen.MAIN_MENU;
}

/**
 * TRILHA ÚNICA (todos os perfis): tela de entrada DEPOIS do contrato de
 * trabalho. Depende apenas do MÓDULO e da filial escolhidos no contrato —
 * nunca do papel do usuário (admin, auditor, auxiliar seguem o mesmo caminho).
 *
 *  LOGIN → BIOMÉTRICA → CONTRATO → [hub do módulo] → ENDEREÇO FÍSICO → INVENTÁRIO
 *
 * - ASSET_CONTROL  → hub de controle de ativo (sem endereço de campo)
 * - INVENTORY      → hub operacional da filial (Menu Principal), cujo primeiro
 *                    item é o ENDEREÇO FÍSICO
 * - INVENTORY sem filial → CONTRATO DE TRABALHO (é lá que a unidade é escolhida
 *                    e a base é carregada; a antiga /unit foi fundida nele)
 */
export function resolveModuleEntryScreen(
  module: AppModule | null | undefined,
  filial: string | null | undefined
): AppScreen {
  if (module === AppModule.ASSET_CONTROL) return AppScreen.ASSET_CONTROL_HOME;
  return String(filial || '').trim() ? AppScreen.MAIN_MENU : AppScreen.WORK_CONTEXT_SELECTION;
}

/**
 * HUB ("Auditoria Inteligente", `#/menu`) exige CONTEXTO ATIVO.
 *
 * Fase 1 da padronização do acesso (biometria → contrato → SaaS): o hub era a
 * ÚNICA tela isenta da trava de unidade e, por isso, o destino de qualquer
 * atalho sem contrato (URL directa `#/menu`, reentrada, pós-troca de senha) —
 * abria a "Auditoria Inteligente" sem filial escolhida. Sem filial activa não
 * há unidade a que os dados pertençam: o destino coerente é o CONTRATO.
 *
 * `hasPanelIntent` isenta os PAINÉIS DE GOVERNAÇA abertos a partir do contrato
 * (`MAIN_MENU` com `openPanel`): não leem a unidade e já têm RBAC próprio na
 * renderização.
 */
export function shouldReturnHubToWorkContext(
  screen: AppScreen,
  selectedUnit: string | null | undefined,
  hasPanelIntent = false
): boolean {
  if (screen !== AppScreen.MAIN_MENU) return false;
  if (hasPanelIntent) return false;
  return !String(selectedUnit || '').trim();
}

/**
 * Destino do «Voltar» quando a pilha não tem ecrã anterior: a raiz da trilha
 * única é o CONTRATO DE TRABALHO. A tela legada de módulos (`/modules`,
 * `MODULE_SELECTION`) NÃO é destino de «Voltar» — antecede o contrato e
 * retiraria o utilizador do contexto que ele já escolheu.
 */
export const VOLTAR_SEM_HISTORICO: AppScreen = AppScreen.WORK_CONTEXT_SELECTION;

/**
 * Pilha depois do «Voltar», numa regra só: recua um passo no histórico e, sem
 * histórico, ancora no CONTRATO DE TRABALHO. Usada pelo `popScreen` do App e
 * pelos fallbacks internos das sub-telas do PAINEL COMPLETO (Gestor de Base,
 * Histórico de Cargas).
 */
export function historicoAposVoltar(history: AppScreen[]): AppScreen[] {
  return history.length > 1 ? history.slice(0, -1) : [VOLTAR_SEM_HISTORICO];
}
