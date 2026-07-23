import { db, DexieAsset } from './sqliteService';
import { isAdminEmail } from '../utils/authUtils';
import { logger } from '../utils/logger';

export interface MasterDashboardStats {
  tenantId: string;
  totalAtivos: number;
  conferidoAtivos: number;
  pendentesAtivos: number;
  avancoPercent: number;
}

export interface AuditorProgress {
  tenantId: string;
  filial: string;
  totalLocal: number;
  totalSincronizado: number;
  totalPendenteSincronizacao: number;
  percentualSincronizado: number;
}

/**
 * Detecta o e-mail do operador atual a partir dos armazenamentos locais (sessionStorage/localStorage)
 */
function detectUserEmail(userEmail?: string): string {
  if (userEmail) return userEmail.trim().toLowerCase();

  try {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed && parsed.email) {
        return parsed.email.trim().toLowerCase();
      }
    }
  } catch (e) {
    logger.warn(">>> [DashboardService] Falha silenciosa ao detectar user no storage:", e);
  }

  try {
    const sessionStr = sessionStorage.getItem('supabase.auth.token') || localStorage.getItem('supabase.auth.token');
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr);
      if (parsed && parsed.user && parsed.user.email) {
        return parsed.user.email.trim().toLowerCase();
      }
    }
  } catch (e) {
    logger.warn(">>> [DashboardService] Falha silenciosa ao detectar token de auth:", e);
  }

  return '';
}

/**
 * Visão do Administrador Master:
 * Calcula o resumo da campanha filtrando estritamente por tenantId.
 * Se o operador for o e-mail admin configurado, ignora a barreira de inquilino (Master Omnisciente)
 * e injeta o token 'GBR_SUPER_ADMIN_CORINGA' agregando dados de todos os inquilinos.
 */
export async function getMasterDashboardStats(tenantId: string, userEmail?: string): Promise<MasterDashboardStats> {
  const email = detectUserEmail(userEmail);
  const isSuperAdmin = isAdminEmail(email);
  const targetTenant = isSuperAdmin ? 'GBR_SUPER_ADMIN_CORINGA' : tenantId;

  try {
    let assets: DexieAsset[] = await db.ativos.toArray();
    // Filtro básico de não-deletados
    assets = assets.filter(a => a._is_deleted !== 1);

    // Se não for super admin, filtra estritamente por tenantId
    if (!isSuperAdmin) {
      const tenantClean = String(tenantId).trim().toUpperCase();
      assets = assets.filter(a => {
        const tId = String(a.tenantId || a._tenantid || '').trim().toUpperCase();
        return tId === tenantClean;
      });
    }

    const totalAtivos = assets.length;
    const conferidoAtivos = assets.filter(a => a._conferido === 1).length;
    const pendentesAtivos = totalAtivos - conferidoAtivos;
    const avancoPercent = totalAtivos > 0 ? Math.round((conferidoAtivos / totalAtivos) * 100) : 0;

    logger.info(`>>> [DashboardService SRE] getMasterDashboardStats executado. Tenant: ${targetTenant}, Total: ${totalAtivos}, Conferidos: ${conferidoAtivos}`);

    return {
      tenantId: targetTenant,
      totalAtivos,
      conferidoAtivos,
      pendentesAtivos,
      avancoPercent
    };
  } catch (err) {
    logger.error(">>> [DashboardService SRE] Erro ao calcular getMasterDashboardStats:", err);
    return {
      tenantId: targetTenant,
      totalAtivos: 0,
      conferidoAtivos: 0,
      pendentesAtivos: 0,
      avancoPercent: 0
    };
  }
}

/**
 * Visão do Auditor:
 * Lista em tempo real o progresso do inventário da sua filial designada,
 * comparando o total de registros locais com o total já sincronizado na nuvem (_is_synced === 1).
 * Otimização de Hardware: Utiliza o índice composto [tenantId+filial] para isolar no disco antes de computar na memória.
 */
export async function getAuditorProgress(tenantId: string, filial: string, userEmail?: string): Promise<AuditorProgress> {
  const email = detectUserEmail(userEmail);
  const isSuperAdmin = isAdminEmail(email);
  
  const tenantClean = String(tenantId).trim();
  const filialClean = String(filial).trim();

  try {
    let assets: DexieAsset[] = [];

    if (isSuperAdmin) {
      // Super admin ignora barreira de inquilino. Se houver filial específica, filtra por ela no disco
      if (filialClean) {
        assets = await db.ativos.where('filial').equals(filialClean).toArray();
      } else {
        assets = await db.ativos.toArray();
      }
    } else {
      // Utilização do índice composto físico para isolar os registros diretamente no disco antes de iterar
      assets = await db.ativos.where('[tenantId+filial]').equals([tenantClean, filialClean]).toArray();
    }

    // Filtro básico de não-deletados
    assets = assets.filter(a => a._is_deleted !== 1);

    const totalLocal = assets.length;
    const totalSincronizado = assets.filter(a => a._is_synced === 1).length;
    const totalPendenteSincronizacao = totalLocal - totalSincronizado;
    const percentualSincronizado = totalLocal > 0 ? Math.round((totalSincronizado / totalLocal) * 100) : 0;

    logger.info(`>>> [DashboardService SRE] getAuditorProgress executado. Filial: ${filialClean}, Local: ${totalLocal}, Sincronizado: ${totalSincronizado}`);

    return {
      tenantId: isSuperAdmin ? 'GBR_SUPER_ADMIN_CORINGA' : tenantId,
      filial: filialClean,
      totalLocal,
      totalSincronizado,
      totalPendenteSincronizacao,
      percentualSincronizado
    };
  } catch (err) {
    logger.error(">>> [DashboardService SRE] Erro ao calcular getAuditorProgress:", err);
    return {
      tenantId: isSuperAdmin ? 'GBR_SUPER_ADMIN_CORINGA' : tenantId,
      filial: filialClean,
      totalLocal: 0,
      totalSincronizado: 0,
      totalPendenteSincronizacao: 0,
      percentualSincronizado: 0
    };
  }
}
