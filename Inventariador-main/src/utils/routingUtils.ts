import { UserRole } from '../types';
import { sqliteService } from '../services/sqliteService';
import { isAdminEmail } from './authUtils';

export interface SupabaseUserProfile {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string | null; 
}

export async function processarRoteamentoPosLoginSaas(
  user: SupabaseUserProfile, 
  navigate: (path: string) => void | Promise<void>
): Promise<void> {
  console.log(`[GBR v2.6] Analisando regras de acesso seguras para: ${user.email}`);

  // 1. Sandbox de Demonstração (DEMO) com bypass antecipado
  if (user.role === 'DEMO' || String(user.role).toUpperCase() === 'DEMO') {
    console.log("[GBR v2.6] Inicializando Sandbox de Demonstração Livre.");
    sessionStorage.setItem('gbr_session_mode', 'DEMO');
    navigate('/dashboard-demo');
    return;
  }

  // 2. Validação de Segurança de Perfil Corporativo
  if (String(user.role).toUpperCase() === 'MASTER' && !user.tenantId) {
    console.error("[GBR v2.6] Bloqueio de Segurança: MASTER sem tenantId.");
    throw new Error("Erro de consistência: Perfil MASTER sem empresa vinculada.");
  }

  const totalAtivosLocal = await sqliteService.countAtivos();
  const isSuperAdmin = isAdminEmail(user.email);
  const isMaster = String(user.role).toUpperCase() === 'MASTER';

  // 3. Fluxo para Base Totalmente Vazia (Lote 0)
  if (totalAtivosLocal === 0) {
    if (isSuperAdmin || isMaster) {
      console.log("[Bootstrap] Base vazia. Redirecionando Admin para Carga Inicial.");
      navigate('/load-database');
    } else {
      console.warn("[Bootstrap] Auditor retido: Banco local vazio. Aguardando provisionamento do Admin.");
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
      if (user.tenantId) {
        sessionStorage.setItem('gbr_active_tenant', user.tenantId);
      }
      navigate('/admin/painel-controle');
    } else {
      // Para auditores, os dados locais comandam. Força seleção de filial.
      navigate('/auditor/selecionar-filial');
    }
    return;
  }
}
