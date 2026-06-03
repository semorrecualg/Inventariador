import { UserRole } from '../types'; 

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

  // =======================================================
  // 1. CHAVE MESTRA: TRATAMENTO PREEMPTIVO DO SUPER-ADMIN
  // =======================================================
  const isSuperAdmin = user.email.toLowerCase() === 'semorr@gmail.com';
  
  if (isSuperAdmin) {
    console.log("[GBR v2.6] Super-Admin autenticado com Chave Mestra Global.");
    sessionStorage.setItem('gbr_admin_scope', 'GLOBAL_SUPER_ADMIN');
    navigate('/saas/painel-global'); 
    return;
  }

  // =======================================================
  // 2. JORNADA DOS DEMAIS PERFIS OPERACIONAIS E CORPORATIVOS
  // =======================================================
  switch (user.role) {
    case 'MASTER':
      console.log(`[GBR v2.6] Gestor MASTER corporativo autenticado.`);
      
      if (!user.tenantId) {
        console.error("[GBR v2.6] Alerta de segurança: Usuário MASTER sem tenantId configurado no Supabase.");
        throw new Error("Erro de consistência: Seu perfil MASTER não possui uma empresa vinculada.");
      }
      
      sessionStorage.setItem('gbr_admin_scope', 'TENANT_MASTER');
      sessionStorage.setItem('gbr_active_tenant', user.tenantId);
      navigate('/admin/painel-controle'); 
      break;

    case 'AUDITOR':
    case 'AUXILIARY_AUDITOR':
    case 'MOBILE_SINGLE':
      console.log("[GBR v2.6] Auditor de campo detectado. Encaminhando para seleção de escopo local.");
      navigate('/auditor/selecionar-filial');
      break;

    case 'DEMO':
      console.log("[GBR v2.6] Inicializando Sandbox de Demonstração Livre.");
      sessionStorage.setItem('gbr_session_mode', 'DEMO');
      navigate('/dashboard-demo');
      break;

    default:
      console.error("[GBR v2.6] Bloqueio preventivo: Perfil ausente ou incompatível com a v2.6.");
      throw new Error("Acesso negado. Perfil de usuário inválido.");
  }
}
