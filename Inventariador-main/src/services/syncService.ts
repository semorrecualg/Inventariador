import localforage from 'localforage';
import { SyncQueueItem } from '../types';
import { isQuotaExceededError, supabase, registerCampaignSyncQueueDelegate, getDatabaseMode, fetchCloudDeletedKeys, fetchCloudConflictRows, chaveDaNuvem, exigirGeracaoBaseCorrente } from './supabaseService';
import { BaseGenerationBlockedError } from '../utils/baseGeneration';
import { canPushToCloud } from './pushGate';
import { enviarFilaAuditoria } from './auditoriaNuvem';
import { sqliteService, db } from './sqliteService';
import { logger } from '../utils/logger';
import { sanitizeAssetKey } from '../utils/assetKey';
import { resolveTenantId } from '../utils/tenantUtils';
import { matchUnitKeys } from '../utils/schema';
import { UPSERT_TIMEOUT_MS, withUpsertTimeout, isSyncTimeoutError } from './syncQueueGuards';
import { isConferido } from '../utils/conferencia';
import { purgarAuditoriaAntiga } from './auditoriaRetencao';
import { assetGpsColumns } from '../utils/assetGps';
import { assinaturaDeFalha, inicioDoDiaDaFalha } from '../utils/syncFalha';
import { normalizeFlag } from '../utils/normalize';
import { resolverConflitoDeSubida } from '../utils/conflitoSubida';
import { isSystemLocked } from '../utils/systemLock';
import {
  semearOutboxDePendentes,
  marcarEnviadosOutbox,
  marcarFalhasOutbox,
  chavesEmRecuo,
  type RegistoParaOutbox
} from './syncOutbox';

/**
 * Marca UM registo como sincronizado nos três stores locais, logo depois de o
 * upsert dele ser confirmado pela nuvem.
 *
 * Antes a marcação era um lote único no fim do ciclo: se o ciclo quebrasse a
 * meio (rede, app em segundo plano, pedido pendurado) o que já tinha subido
 * continuava `_is_synced = 0` e a etiqueta PENDENTE NUVEM ficava para sempre.
 * Em 2026-11-12 isso deixou 15 de 45 ativos na nuvem e 45 pendentes no aparelho.
 */
/**
 * Marca um registo como sincronizado — a escrita é a mesma do envio em massa
 * (`sqliteService.markAssetsSynced`), que também apaga o carimbo de recusa.
 */
const markRecordSynced = async (
  primaryKey: string,
  /** Campos que o sucesso traz da nuvem (conferência/ponto mais recentes). */
  extra?: Record<string, unknown>
): Promise<void> => {
  await sqliteService.markAssetsSynced([primaryKey], extra);
  // Fila durável (v9): o envio aceite sai do envelope. Best-effort — a outbox
  // não pode fazer falhar um envio que a nuvem já confirmou.
  try {
    await marcarEnviadosOutbox([primaryKey]);
  } catch (err) {
    logger.warn(`>>> [Outbox] Envio aceite mas entrada não removida (${primaryKey}):`, err);
  }
};

export interface UserSessionData {
  id: string;
  email: string;
  tenantid: string;
  role: string;
}

export interface SyncResult {
  success: boolean;
  processedCount: number;
  failedCount?: number;
  error?: string;
}

/**
 * Portão do envio para a nuvem.
 *
 * A BASE LOCAL é hermética (decisão F1 do plano): além de ser preciso estar no
 * aparelho, o modo de base tem de ser online. Antes bastava
 * `Capacitor.isNativePlatform()`: o ciclo de fundo (`runSyncLoopCycle`) chamava
 * `processDataSyncQueue`/`photoSyncManager`/`processCampaignSyncQueue` sem
 * consultar o modo e, com sessão e filial activas, ativos conferidos em BASE
 * LOCAL podiam subir para o Supabase.
 *
 * A regra vive em `services/pushGate.ts` para a fila da trilha de auditoria (F2)
 * a reutilizar sem fechar um ciclo de imports (`auditoriaNuvem` ↔ `syncService`).
 * Reexportada daqui para não mudar os consumidores existentes.
 */
export { canPushToCloud };

const SYNC_DISCARD_AUDIT = 'SYNC_PENDING_DISCARDED';
/** Janela em que o mesmo descarte não volta a ser registrado (o ciclo roda a cada 60 s). */
const SYNC_DISCARD_WINDOW_MS = 10 * 60 * 1000;

/**
 * A filial do registo e a da sessão podem estar escritas de formas diferentes:
 * `010101`, `010101 CICOPAL GO`, `010101-CICOPAL-GO`. Comparar as strings cruas
 * descartava pendentes legítimos — o ativo conferido nunca subia.
 */
const filialMatchesSession = (recordFilial: unknown, sessionFilial: string): boolean =>
  matchUnitKeys(String(recordFilial ?? ''), sessionFilial);

/**
 * Registra em `audit_logs` quando o filtro de contrato/filial descarta TODOS os
 * pendentes do aparelho. Sem isto o ciclo devolvia sucesso com 0 registros e o
 * operador via a base pendente sem nenhuma explicação.
 */
const auditDiscardedPending = async (
  userId: string,
  pending: ReadonlyArray<Record<string, unknown>>,
  target: { tenantid: string; filial: string },
): Promise<void> => {
  try {
    const tenants = Array.from(new Set(pending.map((record) => readLegacyRecordTenant(record).trim().toUpperCase() || '(vazio)'))).sort();
    const filiais = Array.from(new Set(pending.map((record) => String(record.filial ?? record._unitid ?? '').trim().toUpperCase() || '(vazio)'))).sort();
    const registroId = `${target.tenantid}|${target.filial}`;
    const signature = `${pending.length}|${tenants.join(',')}|${filiais.join(',')}`;

    const recentes = await db.audit_logs
      .filter((log) => log.acao === SYNC_DISCARD_AUDIT && log.registro_id === registroId)
      .toArray();
    const jaRegistado = recentes.some((log) => {
      if (Date.now() - new Date(String(log.updated_at || 0)).getTime() > SYNC_DISCARD_WINDOW_MS) return false;
      try {
        return JSON.parse(String(log.delta || '{}')).signature === signature;
      } catch {
        return false;
      }
    });
    if (jaRegistado) return;

    const details = `Todos os ${pending.length} ativo(s) pendente(s) foram descartados pelo filtro de contrato/filial. `
      + `Sessão: contrato ${target.tenantid} · filial ${target.filial}. `
      + `Pendentes: contrato(s) ${tenants.join(', ')} · filial(is) ${filiais.join(', ')}. `
      + `Nada foi apagado: os registos continuam pendentes no aparelho.`;

    await sqliteService.logAuditEvent(
      userId,
      SYNC_DISCARD_AUDIT,
      'local_assets',
      registroId,
      details,
      JSON.stringify({ signature, session: target, pending: { count: pending.length, tenants, filiais } })
    );
    logger.warn(`>>> [Sync Guard] ${details}`);
  } catch (err) {
    logger.warn('>>> [Sync Guard] Falha ao registrar o descarte de pendentes:', err);
  }
};

/**
 * Alvo do upsert da fila: a chave de origem, escopada ao contrato.
 *
 * A fila não envia `id`, e o `upsert` sem `onConflict` usa a chave primária da
 * tabela `(tenantid, id)` — o `INSERT` caía sempre no índice único
 * `(tenantid, primarykey)` e um ativo já existente na nuvem ficava em `23505
 * duplicate key` para sempre (ecrãs ATIVOS/CONFERIDOS de 2026-11-19). Com o
 * alvo certo o Postgres actualiza a linha existente, sem tocar no `id`.
 * Fonte única: o teste da fila compara com esta constante.
 */
export const ASSETS_CONFLICT_TARGET = 'tenantid, primarykey';

const SYNC_RECORD_FAIL_AUDIT = 'SYNC_RECORD_FAIL';
const SYNC_RECORD_EXCEPTION_AUDIT = 'SYNC_RECORD_EXCEPTION';
/**
 * Conflito por campo resolvido na subida. É a mesma acção que a descida já
 * regista (`SYNC_CONFLICT`, no merge do pull), para o painel e a trilha lerem
 * uma só ideia: «dois auditores no mesmo ativo, decidido por tempo».
 */
const SYNC_CONFLICT_AUDIT = 'SYNC_CONFLICT';
/** Janela em que a mesma falha (primarykey + erro) não volta a ser registada. */
const SYNC_FAILURE_AUDIT_WINDOW_MS = 10 * 60 * 1000;
/**
 * As recusas de envio são PRESERVADAS pelo expurgo, por isso a janela delas é o
 * dia e não os 10 min das outras ações: a mesma assinatura escreve no máximo uma
 * linha por dia (`inicioDoDiaDaFalha`), em vez de 144 num ativo preso.
 */

/**
 * Uma linha de auditoria por registo falhado, por janela — e não a cada ciclo.
 *
 * O ciclo de sincronização corre a cada 60 s (`App.tsx`). Sem janela, um ativo
 * recusado por RLS escrevia `SYNC_RECORD_FAIL` ~1.440 vezes por dia, e um lote
 * de 200 escrevia muito mais. A mesma janela cobre os dois desfechos do
 * upsert: a recusa devolvida pela nuvem (`SYNC_RECORD_FAIL`) e a excepção
 * lançada no envio (`SYNC_RECORD_EXCEPTION`), que também escrevia uma linha por
 * registo em cada ciclo. `audit_logs` é a ferramenta com que se diagnosticou o
 * «PENDENTE NUVEM» do #95: inundada, o diagnóstico seguinte fica mais lento
 * exactamente quando é preciso. A assinatura `primarykey|erro` fica no `delta`
 * e é comparada com o que já foi registado na janela.
 *
 * O erro é normalizado antes de assinar (`assinaturaDeFalha`): a mensagem crua
 * pode trazer id de pedido, UUID, data/hora ou ficheiro:linha da pilha, e cada
 * variante reabria a janela — a mesma recusa voltava a ser registada.
 */
const loadRecentSyncAuditSignatures = async (
  acao: string,
  agora: number = Date.now()
): Promise<Set<string>> => {
  // Dia (UTC) corrente: a linha de hoje é a que impede a repetição de hoje.
  const cutoffIso = inicioDoDiaDaFalha(agora);
  const recentes = await db.audit_logs.where('updated_at').above(cutoffIso).toArray();
  const signatures = new Set<string>();
  for (const log of recentes) {
    if (log.acao !== acao) continue;
    try {
      const signature = JSON.parse(String(log.delta || '{}')).signature;
      if (typeof signature !== 'string' || !signature) continue;
      // Linhas gravadas antes da normalização tinham o detalhe cru: normaliza
      // também do lado da leitura, senão a mesma falha contava como nova.
      const corte = signature.indexOf('|');
      signatures.add(
        corte === -1
          ? signature
          : assinaturaDeFalha(signature.slice(0, corte), signature.slice(corte + 1))
      );
    } catch {
      // Linha antiga sem delta legível não conta como falha já registada.
    }
  }
  return signatures;
};

/**
 * A exclusão que venceu a subida — uma linha de trilha por registo e por janela.
 *
 * Mesmo com o registo já aplicado (`markAssetsDeleted`), uma gravação de estado
 * atrasada pode voltar a pô-lo pendente. A janela de 10 min garante que, nesse
 * caso, a trilha não ganha uma linha `SYNC_DELETE_WINS` a cada ciclo de 60 s.
 */
const auditDeleteWins = async (
  userId: string,
  primaryKey: string,
  details: string
): Promise<void> => {
  try {
    const cutoffIso = new Date(Date.now() - SYNC_FAILURE_AUDIT_WINDOW_MS).toISOString();
    const recentes = await db.audit_logs
      .where('updated_at')
      .above(cutoffIso)
      .filter((log) => log.acao === 'SYNC_DELETE_WINS' && String(log.registro_id || '') === primaryKey)
      .toArray();
    if (recentes.length > 0) return;
    await sqliteService.logAuditEvent(userId, 'SYNC_DELETE_WINS', 'local_assets', primaryKey, details);
  } catch (err) {
    logger.warn('>>> [Sync] Falha ao registar a exclusão que prevaleceu na trilha:', err);
  }
};

const auditSyncRecordFailure = async (
  userId: string,
  acao: string,
  primaryKey: string,
  details: string,
  jaAuditadas: Set<string>,
  agora: number = Date.now(),
): Promise<void> => {
  const signature = assinaturaDeFalha(primaryKey, details);
  if (jaAuditadas.has(signature)) return;
  await sqliteService.logAuditEvent(
    userId,
    acao,
    'local_assets',
    primaryKey,
    details,
    JSON.stringify({ signature }),
    new Date(agora).toISOString()
  );
  jaAuditadas.add(signature);
};

/**
 * A TRILHA DE RECUSAS, PARA O CICLO E PARA OS TESTES
 * ============================================================================
 * As assinaturas já registadas HOJE (a janela é o dia — ver `inicioDoDiaDaFalha`)
 * e o registo de uma recusa passam a ter nome próprio e exportado: é o mesmo
 * caminho que o ciclo usa, sem duplicar a regra no teste.
 */
export const assinaturasDeFalhaDeHoje = (
  acao: string,
  agora: number = Date.now()
): Promise<Set<string>> => loadRecentSyncAuditSignatures(acao, agora);

export const registarRecusaNaTrilha = (
  userId: string,
  acao: string,
  primaryKey: string,
  details: string,
  jaAuditadas: Set<string>,
  agora: number = Date.now()
): Promise<void> => auditSyncRecordFailure(userId, acao, primaryKey, details, jaAuditadas, agora);

/**
 * CARIMBO DA RECUSA NO PRÓPRIO REGISTO
 * ============================================================================
 * A recusa já ia para `audit_logs`, mas o cartão só lia `_is_synced`: «na fila»
 * e «recusado pela nuvem» ficavam iguais para o operador. Aqui a mesma recusa
 * fica no registo local (`_syncFailAt`/`_syncFailReason`), que é o que o selo
 * vermelho do cartão e o contador do botão global lêem.
 *
 * O carimbo é reescrito no máximo uma vez por `SYNC_FAILURE_STAMP_WINDOW_MS`
 * com o mesmo motivo (o ciclo de fundo roda a cada 60 s) e apagado no sucesso.
 * Usa o registo que já está em memória no laço — não faz uma leitura extra.
 */
const marcarFalhaNoRegisto = async (
  primaryKey: string,
  motivo: string,
  emMemoria?: Record<string, unknown>,
): Promise<void> => {
  try {
    await sqliteService.markAssetsFailed([{ primarykey: primaryKey, motivo, registo: emMemoria }]);
  } catch (err) {
    logger.warn('>>> [Sync Alert] Falha ao carimbar a recusa no registo local:', err);
  }
};

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';
const CAMPAIGN_QUEUE_STORE = 'gbr_campaign_sync_queue';

// Fronteira de leitura legada: registros persistidos por versões antigas podem
// conter as chaves tenantId/_tenantid. Todo ponto de ESCRITA usa `tenantid`.
const readLegacyRecordTenant = (r: unknown): string => {
  const rec = r as Record<string, unknown>;
  return String(rec.tenantId ?? rec._tenantid ?? rec.tenantid ?? '');
};

// Configura o store local
const queueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: PHOTO_QUEUE_STORE
});

const campaignQueueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: CAMPAIGN_QUEUE_STORE
});

const photoQueueStore = queueStore;

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// PREVENÇÃO ABSOLUTA DE TDZ (HOISTING ESTRITO) - Variáveis de Controle no Topo
let isSyncingLoopActive = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

const isStringInvalid = (val: unknown): boolean => {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toUpperCase();
  return s === '' || s === 'UNDEFINED' || s === 'NULL' || s === 'NULO';
};

/**
 * Filial de trabalho activa, com a mesma cascata que a UI usa (App.tsx).
 *
 * O Android esvazia o `sessionStorage` quando mata a WebView em segundo plano,
 * e todas as guardas de envio liam a filial SÓ dali. Depois de um reinício do
 * processo o ciclo de sincronização voltava em silêncio sem enviar nada: os
 * ativos conferidos continuavam `_is_synced = 0` e a etiqueta «PENDENTE NUVEM»
 * ficava para sempre, mesmo com a unidade visível no ecrã (a UI já caía para o
 * `localStorage`/sessão). Por isso aqui a leitura segue a mesma ordem.
 */
const readActiveFilial = (): string | null => {
  const candidates = [
    sessionStorage.getItem('filial'),
    sessionStorage.getItem('selectedUnit'),
    localStorage.getItem('filial'),
    localStorage.getItem('app_selected_unit'),
  ];
  for (const candidate of candidates) {
    if (!isStringInvalid(candidate)) return candidate;
  }
  return null;
};

/**
 * Verifica condições de segurança física de hardware (trava preventiva de bateria baixa < 5%)
 */
export const checkHardwareSafety = async (): Promise<boolean> => {
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const battery: any = await (navigator as any).getBattery();
      if (battery && battery.level <= 0.05 && !battery.charging) {
        logger.warn(`>>> [Hardware Safety Check] BLOQUEIO DE BATERIA ATIVO: Carga atual de ${Math.round(battery.level * 100)}% sem fonte externa conectada. Sincronização e gravações físicas suspensas.`);
        return false;
      }
    }
  } catch (err) {
    logger.error(">>> [Hardware Safety Check] Erro de verificação do subsistema de energia:", err);
  }
  return true;
};

const getUserFromLocalStorage = (): UserSessionData | null => {
  try {
    const data = localStorage.getItem('gbr_user_session') || sessionStorage.getItem('app_current_user');
    if (!data) {
      return null;
    }
    const parsed = JSON.parse(data);
    
    if (!parsed || typeof parsed !== 'object' || !parsed.id) {
      return null;
    }

    const tId = parsed.tenantId || 
                parsed._tenantid || 
                parsed.tenantid || 
                parsed.tenant_id || 
                localStorage.getItem('tenantId') || 
                sessionStorage.getItem('tenantId') || 
                localStorage.getItem('_tenantid') || 
                sessionStorage.getItem('_tenantid') ||
                '';

    if (isStringInvalid(tId)) {
      logger.error(">>> [Sync Guard] Vazamento multidomínio detectado! tenantid é inválido ou ausente.");
      return null;
    }
    
    logger.info(">>> [Sync Guard] Identificador de contrato (tenantid) resolvido com sucesso:", tId);
    
    return {
      id: String(parsed.id),
      email: String(parsed.email || ''),
      tenantid: String(tId),
      role: String(parsed.role || 'AUDITOR')
    };
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    logger.error(">>> [Sync Guard] Falha catastrófica ao decodificar sessão do operador no LocalStorage:", errorMsg);
    
    sqliteService.logAuditEvent(
      'SYSTEM',
      'LOCAL_STORAGE_DECODE_FAIL',
      'localStorage',
      'gbr_user_session',
      `Erro de decode de sessao: ${errorMsg}`
    ).catch(err => {
      logger.error(">>> [Sync Telemetry] Erro ao gravar log de falha de decodificação no SQLite:", err);
    });
    
    return null;
  }
};

// REQUISITO 1: 'query(sql, params)' já retorna Record<string, unknown>[] bruto.
const fallbackStore = localforage.createInstance({
  name: 'gbr_sqlite_fallback',
  storeName: 'assets_fallback'
});



export interface CampaignSyncItem {
  id: string;
  campaignId: string;
  action: 'DELETE' | 'UPDATE_STATUS';
  status?: unknown;
  closedBy?: string;
  timestamp: number;
}

export const addCampaignToSyncQueue = async (
  campaignId: string, 
  action: 'DELETE' | 'UPDATE_STATUS', 
  status?: unknown, 
  closedBy?: string
): Promise<string> => {
  const id = generateUUID();
  const item: CampaignSyncItem = {
    id,
    campaignId,
    action,
    status,
    closedBy,
    timestamp: Date.now()
  };
  await campaignQueueStore.setItem(id, item);
  logger.info(`>>> [Sync Campaign] Campanha ${campaignId} empilhada na fila delta (${action}).`);
  
  if (navigator.onLine) {
    processCampaignSyncQueue().catch(console.error);
  }
  return id;
};

registerCampaignSyncQueueDelegate(addCampaignToSyncQueue);

export const getPendingCampaignSyncItems = async (): Promise<CampaignSyncItem[]> => {
  const items: CampaignSyncItem[] = [];
  await campaignQueueStore.iterate((value: CampaignSyncItem) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

export const processCampaignSyncQueue = async (): Promise<{ success: boolean; processedCount: number }> => {
  if (!canPushToCloud()) {
    return { success: true, processedCount: 0 };
  }
  const user = getUserFromLocalStorage();
  const rawTenant = user ? resolveTenantId(user) : null;
  const rawFilial = readActiveFilial();

  if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
    if (user && (isStringInvalid(rawTenant) || isStringInvalid(rawFilial))) {
      logger.warn(">>> [Sync Fail-Safe] Identificador de Contrato ou Filial inválido ou ausente na fila de campanhas. Suspendendo processamento.");
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gbr_sync_warning', {
          detail: { message: "Parâmetros voláteis de rede (Tenant ou Filial) ausentes. Sincronização de campanhas postergada." }
        }));
      }
    }
    return { success: false, processedCount: 0 };
  }
  // `getDatabaseMode()` devolve INTERNAL apenas quando não há credenciais: um
  // INTERNAL herdado no localStorage não pode congelar o DELETE/UPDATE remoto.
  if (getDatabaseMode() === 'INTERNAL') {
    return { success: false, processedCount: 0 };
  }
  if (!navigator.onLine) return { success: false, processedCount: 0 };

  try {
    const items = await getPendingCampaignSyncItems();
    if (items.length === 0) return { success: true, processedCount: 0 };

    logger.info(`>>> [Sync Campaign] Processando ${items.length} campanhas pendentes...`);
    let processedCount = 0;

    for (const item of items) {
      try {
        if (!supabase) continue;
        
        if (item.action === 'DELETE') {
          const { error } = await supabase.from('campaigns').delete().eq('id', item.campaignId);
          if (error) throw error;
        } else if (item.action === 'UPDATE_STATUS') {
          const updateData: Record<string, unknown> = { 
            status: item.status, 
            end_date: item.status === 'CLOSED' ? new Date().toISOString() : undefined 
          };
          if (item.status === 'CLOSED' && item.closedBy) {
            updateData.closure_details = {
              closed_by: item.closedBy,
              closed_at: new Date().toISOString(),
              snapshot_status: 'PENDING'
            };
          }
          const { error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', item.campaignId);
          if (error) throw error;
        }
        
        await campaignQueueStore.removeItem(item.id);
        processedCount++;
        logger.info(`>>> [Sync Campaign Success] Campanha ${item.campaignId} sincronizada com nuvem.`);
      } catch (err) {
        logger.error(`>>> [Sync Campaign Fail] Erro ao sincronizar campanha ${item.campaignId}:`, err);
        if (!navigator.onLine) break;
      }
    }

    return { success: true, processedCount };
  } catch (err) {
    logger.error(">>> [Sync Campaign Fatal] Falha ao varrer fila de campanhas:", err);
    return { success: false, processedCount: 0 };
  }
};

export const photoSyncManager = {
  processPhotoSyncQueue: async (): Promise<{ success: boolean; uploadCount: number; failedCount: number }> => {
    if (!canPushToCloud()) {
      return { success: true, uploadCount: 0, failedCount: 0 };
    }
    const user = getUserFromLocalStorage();
    const rawTenant = user ? resolveTenantId(user) : null;
    const rawFilial = readActiveFilial();

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      if (user && (isStringInvalid(rawTenant) || isStringInvalid(rawFilial))) {
        logger.warn(">>> [Sync Fail-Safe] Identificador de Contrato ou Filial inválido ou ausente na fila de fotos. Suspendendo processamento.");
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gbr_sync_warning', {
            detail: { message: "Parâmetros voláteis de rede (Tenant ou Filial) ausentes. Sincronização de fotos postergada." }
          }));
        }
      }
      return { success: false, uploadCount: 0, failedCount: 0 };
    }
    if (sqliteService.isImportingBatch) {
      logger.info('[Sync Photo] Sincronização suspensa: Importação em lote ativa.');
      return { success: false, uploadCount: 0, failedCount: 0 };
    }
    if (!navigator.onLine) return { success: false, uploadCount: 0, failedCount: 0 };

    // `getDatabaseMode()` em vez do valor cru do localStorage: sem a chave gravada
    // a fila de fotos ficava parada enquanto o resto do app usava a nuvem.
    if (getDatabaseMode() === 'INTERNAL') {
      logger.info('[Sync Photo] Sincronização suspensa: Modo OFFLINE/INTERNO ativo.');
      return { success: false, uploadCount: 0, failedCount: 0 };
    }

    let uploadCount = 0;
    let failedCount = 0;
    try {
      const keys = await photoQueueStore.keys();
      
      for (const key of keys) {
        const item = await photoQueueStore.getItem<SyncQueueItem>(key);
        if (!item) continue;

        if (item.attempts >= 3) {
          logger.warn(`>>> [Sync Photo] Item ${item.id} atingiu o limite de tentativas. Expurgação telemetria.`);
          failedCount++;
          
          await sqliteService.logAuditEvent(
            user.id,
            'PHOTO_SYNC_ABORTED_MAX_ATTEMPTS',
            'assets_counting',
            item.assetId,
            `Upload abortado após 3 tentativas. ID: ${item.id}. Último erro: ${item.error || 'Nenhum'}`
          ).catch(console.error);

          await photoQueueStore.removeItem(key);
          continue;
        }

        item.attempts += 1;
        item.lastAttempt = Date.now();

        try {
          const fileExt = 'jpg';
          const tenantidClean = String(rawTenant).trim();
          const filePath = `${tenantidClean}/${item.assetId}/${item.id}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('asset-photos')
            .upload(filePath, item.photoBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('asset-photos')
            .getPublicUrl(filePath);

          // Atualização nas tabelas oficiais via Dexie (IndexedDB) sem usar SQL puro.
          // Chave composta [tenantid+primarykey] (v6): flags são aplicadas por
          // primarykey via índice (todas as linhas da chave, qualquer contrato).
          // O sucesso passa pelo ponto único (`markAssetsSynced`): além de
          // `_is_synced = 1` e do `_photoUrl`, apaga o carimbo de recusa — um
          // registo igual à nuvem não pode ficar com selo vermelho agarrado.
          const assetKey = String(item.assetId).trim();
          await sqliteService.markAssetsSynced([assetKey], { _photoUrl: publicUrl });

          await photoQueueStore.removeItem(key);
          uploadCount++;
          
          logger.info(`>>> [Sync Photo Success] Imagem do ativo ${item.assetId} enviada para o Supabase e limpa localmente.`);
        } catch (uploadFail) {
          const uploadFailMsg = uploadFail instanceof Error ? uploadFail.message : String(uploadFail);
          item.error = uploadFailMsg || "Erro desconhecido no Storage";
          await photoQueueStore.setItem(key, item);
          logger.error(`>>> [Sync Photo Fail] Tentativa ${item.attempts} falhou para o item ${item.id}:`, uploadFail);
          failedCount++;
          
          if (isQuotaExceededError(uploadFail)) {
            const errorMsg = 'LIMITE DE ARMAZENAMENTO ATINGIDO (Supabase Quota). Sincronização de fotos suspensa para evitar perda de dados. Contate o administrador.';
            logger.error(`[Sync Photo] ${errorMsg}`);
            window.dispatchEvent(new CustomEvent('gbr_sync_quota_error', { 
              detail: { message: errorMsg } 
            }));
            break;
          }
        }
      }
      
      return { success: failedCount === 0, uploadCount, failedCount };
    } catch (globalError) {
      logger.error(">>> [Sync Photo Fatal] Falha crítica ao processar fila de imagens:", globalError);
      return { success: false, uploadCount, failedCount: failedCount + 1 };
    }
  }
};

const _syncService = {
  isStringInvalid,

  processDataSyncQueue: async (): Promise<SyncResult> => {
    if (!canPushToCloud()) {
      // A blindagem tem ciclo próprio de saída: quando o Administrador liga o
      // «Pronto para Campo» com o app aberto, o portão fecha no ciclo seguinte
      // (antes só fechava num arranque novo, que forçava o modo a INTERNAL).
      if (isSystemLocked()) {
        logger.info('>>> [Sync] Envio suspenso: sistema blindado (Pronto para Campo).');
      }
      return { success: true, processedCount: 0 };
    }
    const user = getUserFromLocalStorage();
    const rawTenant = user ? resolveTenantId(user) : null;
    const rawFilial = readActiveFilial();

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      return { success: false, processedCount: 0, error: "Sincronização abortada: Usuário ou filial indisponíveis." };
    }

    if (sqliteService.isImportingBatch) {
      logger.warn(">>> [Sync Fail-Safe] Bloqueio imperativo: Operação suspensa por atividade na Carga Expert.");
      return { success: false, processedCount: 0, error: "Sincronização suspensa: Importação em lote activa." };
    }

    if (!navigator.onLine) {
      return { success: false, processedCount: 0, error: "Dispositivo em modo Offline" };
    }

    // SELO DE GERAÇÃO: esta fila é o caminho normal de envio e escreve em
    // `assets` directamente, sem passar por `syncAssetsToCloud`. Sem esta
    // chamada o portão não valia para o fluxo real: um aparelho com a base
    // antiga repovoava a nuvem reiniciada no primeiro ciclo.
    try {
      await exigirGeracaoBaseCorrente();
    } catch (err) {
      if (err instanceof BaseGenerationBlockedError) {
        return { success: false, processedCount: 0, error: err.message };
      }
      throw err;
    }

    const tenantidClean = String(rawTenant).trim();
    const filialClean = String(rawFilial).trim();

    try {
      // FASE 1 — envelope durável: a outbox nasce semeada do que a fila legada
      // já tinha pendente (`_is_synced = 0`). Uma vez por sessão e sem poder
      // bloquear o envio: se a semeadura falhar, a drenagem segue como antes.
      try {
        await semearOutboxDePendentes();
      } catch (seedErr) {
        logger.warn('>>> [Outbox] Semeadura da fila durável falhou (o envio continua):', seedErr);
      }

      // 1. ANTI-DUPLICATION FILTER: Ler única e exclusivamente a tabela 'local_assets' buscando registros onde '_is_synced = 0' via Dexie API
      const pendingRecords = await db.local_assets.where('_is_synced').equals(0).toArray();

      // Filtro de Multi-Tenancy e Unidade com custo documentado para campos não indexados (apenas filial e _is_synced são indexados no store da v1)
      const records = (pendingRecords || []).filter(record => {
        const isTenantMatch = readLegacyRecordTenant(record).trim().toUpperCase() === tenantidClean.toUpperCase();
        const isFilialMatch = filialMatchesSession(record.filial || record._unitid, filialClean);
        return isTenantMatch && isFilialMatch;
      });

      if (records.length === 0) {
        // Nada casou: pode ser só um pendente de outra unidade do mesmo
        // contrato, mas o operador tem de saber que NADA subiu e por quê.
        await auditDiscardedPending(
          user.id,
          pendingRecords as unknown as ReadonlyArray<Record<string, unknown>>,
          { tenantid: tenantidClean, filial: filialClean }
        );
        return { success: true, processedCount: 0, failedCount: 0 };
      }

      // RECUO (v9): a outbox diz quando cada ativo pode voltar a ser tentado.
      // Sem esta leitura o `next_attempt_at` era um campo que ninguém lia e uma
      // recusa era repetida a cada ciclo de 60 s — a rede e a trilha pagavam
      // por isso. Um registo ainda sem envelope é tentado (primeira tentativa,
      // é o certo); se falhar, o caminho de falha cria a entrada e a partir daí
      // o recuo vale para ele também.
      const recuo = await chavesEmRecuo(tenantidClean);
      const tentaveis = recuo.size === 0
        ? records
        : records.filter((record) => !recuo.has(sanitizeAssetKey(String(record.primarykey || record.id || ''))));
      if (tentaveis.length === 0) {
        logger.info(
          `>>> [Sync] ${records.length} pendente(s) em recuo — nova tentativa quando o prazo passar.`
        );
        return { success: true, processedCount: 0, failedCount: 0 };
      }

      // EXCLUSÃO VENCE A SUBIDA: o upsert não lê o estado remoto, por isso um
      // aparelho offline reenviava a cópia ativa de um ativo apagado noutro
      // lado e reactivava-o em todos. A nuvem é consultada UMA vez por ciclo
      // (nunca por registo) e os apagados ficam fora do envio.
      const apagadasNaNuvem = await fetchCloudDeletedKeys(
        [tenantidClean],
        tentaveis.map(record => String(record.primarykey || record.id || ''))
      );

      // CONFLITO POR CAMPO NA SUBIDA (H1 · Fase 2): o upsert sobrescreve as
      // colunas que leva. Sem saber o que a nuvem já tem, um aparelho com a
      // fila parada apagava a conferência (ou o ponto de GPS) que outro
      // auditor gravou depois — a leitura mais antiga ficava na nuvem. A
      // mesma leitura em lote que serve a exclusão serve aqui; falha para o
      // lado seguro (mapa vazio = envio como antes).
      let estadoNaNuvem = new Map<string, Record<string, unknown>>();
      try {
        estadoNaNuvem = await fetchCloudConflictRows(
          [tenantidClean],
          tentaveis.map(record => String(record.primarykey || record.id || ''))
        );
      } catch (conflitoErr) {
        logger.warn('>>> [Sync] Estado remoto do conflito por campo indisponível (o envio segue):', conflitoErr);
      }

      const syncedPrimaryKeys: string[] = [];
      const failedPrimaryKeys: string[] = [];
      // Os registos que falharam, e não só as chaves: a outbox precisa do
      // contrato e da operação para criar o envelope de quem ainda não tinha.
      const failedRecords: RegistoParaOutbox[] = [];
      // Assinaturas das recusas já auditadas na janela. Carregadas no primeiro
      // erro do ciclo (não em todos os ciclos) e actualizadas a cada registo.
      let failureSignatures: Set<string> | null = null;
      let exceptionSignatures: Set<string> | null = null;
      let conflictSignatures: Set<string> | null = null;

      for (const record of tentaveis) {
        // GUARDA DE CONECTIVIDADE EM TEMPO REAL: Evita enchentes de erros caso o sinal caia no meio do laço
        if (!navigator.onLine) {
          logger.warn(">>> [Sync Guard] Conectividade perdida no meio do laço de processamento. Abortando ciclo.");
          break;
        }

        // Chave canônica única: o que sobe para a nuvem é o mesmo `primarykey` local.
        const pKey = sanitizeAssetKey(record.primarykey || record.id);
        if (isStringInvalid(pKey)) {
          failedPrimaryKeys.push(String(pKey));
          continue;
        }

        if (apagadasNaNuvem.has(`${tenantidClean.trim().toUpperCase()}|${String(pKey).trim()}`)) {
          // O registo está apagado na nuvem: nada sobe daqui. NÃO se marca como
          // sincronizado — a cópia local ainda está desactualizada e o pull
          // seguinte aplica a exclusão (`mesclarComExclusao`). A trilha diz o
          // que aconteceu, para o «Pendente Nuvem» não ficar sem explicação.
          logger.warn(`>>> [Sync] Ativo ${pKey} apagado na nuvem: a exclusão prevalece e nada foi enviado.`);
          // Aplica já a exclusão ao registo local: sem isto ele continuava
          // pendente e a fila voltava a tentá-lo (e a regravar a decisão) a
          // cada ciclo de 60 s até um pull chegar.
          try {
            await sqliteService.markAssetsDeleted([String(pKey)]);
          } catch (markErr) {
            logger.warn('>>> [Sync] Falha ao aplicar a exclusão da nuvem ao registo local:', markErr);
          }
          await auditDeleteWins(
            user.email || 'system',
            String(pKey),
            'Exclusão na nuvem prevalece sobre a cópia local pendente: nada foi enviado e o registo local fica apagado (restauro explícito para voltar).'
          );
          continue;
        }

        // Decisão por grupo (conferência/GPS) antes de montar o payload: a
        // nuvem só vence com uma leitura mais recente e os campos dela saem do
        // envio, ficando a coluna da nuvem como está.
        const remoto = estadoNaNuvem.size > 0
          ? estadoNaNuvem.get(chaveDaNuvem(tenantidClean, pKey))
          : undefined;
        const conflito = resolverConflitoDeSubida(
          record as unknown as Record<string, unknown>,
          remoto
        );

        const contaValue = String(record.contacontabil || (record as unknown as Record<string, unknown>).conta_contabil || '').trim();
        if (contaValue === '131105001') {
          // Marcar como sincronizado para pular a repetição na fila sem enviar ao Supabase (Regra Fiscal)
          syncedPrimaryKeys.push(String(pKey));
          await markRecordSynced(String(pKey));
          continue;
        }

        // 3. ISOLAMENTO EM CASO DE FALHA DE REDE OU RLS (401/403) COM TRATAMENTO RESILIENTE
        try {
          if (!supabase) throw new Error("Instância do Supabase indisponível.");
          
          // 2. VETO A PAYLOADS POLUÍDOS E TRANCA tenantid: Enviar apenas colunas oficiais exigidas e trancas ocultas (21 índices contábeis)
          const payload: Record<string, unknown> = {
            tenantid: tenantidClean,
            filial: filialClean,
            status: record.status !== undefined && record.status !== null ? String(record.status).trim() : 'ATIVO',
            etiqueta: record.etiqueta !== undefined && record.etiqueta !== null ? String(record.etiqueta).trim() : '',
            qt: record.qt !== undefined && record.qt !== null ? Number(record.qt) : 1,
            descricaodoativo: record.descricaodoativo !== undefined && record.descricaodoativo !== null ? String(record.descricaodoativo).trim() : '',
            serial: record.serial !== undefined && record.serial !== null ? String(record.serial).trim() : null,
            dataaqusic: record.dataaqusic !== undefined && record.dataaqusic !== null ? String(record.dataaqusic).trim() : null,
            cnpj: record.cnpj !== undefined && record.cnpj !== null ? String(record.cnpj).trim() : null,
            nomefornecedor: record.nomefornecedor !== undefined && record.nomefornecedor !== null ? String(record.nomefornecedor).trim() : null,
            notafiscal: record.notafiscal !== undefined && record.notafiscal !== null ? String(record.notafiscal).trim() : null,
            endereco: record.endereco !== undefined && record.endereco !== null ? String(record.endereco).trim() : null,
            registro: record.registro !== undefined && record.registro !== null ? String(record.registro).trim() : null,
            subreg: record.subreg !== undefined && record.subreg !== null ? String(record.subreg).trim() : null,
            databaixa: record.databaixa !== undefined && record.databaixa !== null ? String(record.databaixa).trim() : null,
            contacontabil: record.contacontabil !== undefined && record.contacontabil !== null ? String(record.contacontabil).trim() : null,
            primarykey: pKey,
            centrodecusto: record.centrodecusto !== undefined && record.centrodecusto !== null ? String(record.centrodecusto).trim() : null,
            vlraquisic: record.vlraquisic !== undefined && record.vlraquisic !== null ? Number(record.vlraquisic) : 0,
            sn1_recno: record.sn1_recno !== undefined && record.sn1_recno !== null ? Number(record.sn1_recno) : null,
            sn3_recno: record.sn3_recno !== undefined && record.sn3_recno !== null ? Number(record.sn3_recno) : null,
            // REGISTRO ADOTADO: rótulo `rad_NNNNNN` do item criado copiando os
            // dados de outra unidade. O registo novo sobe com `sn1_recno` nulo
            // (não duplica a chave de ninguém) e o vínculo com a origem fica em
            // `rad_recno`. Se a coluna ainda não existir na nuvem, o laço de
            // PGRST204 reenvia sem ela — o ativo não se perde.
            rad_recno: record.rad_recno !== undefined && record.rad_recno !== null ? String(record.rad_recno).trim() : null,
            DE_PARA: record.DE_PARA !== undefined && record.DE_PARA !== null ? String(record.DE_PARA).trim() : null,
            // PONTE GPS: a conferência grava `latitude`/`longitude`; a nuvem só
            // tem `gps_lat`/`gps_lng`. Ler só a coluna legada subia o ativo sem
            // a coordenada que o operador acabou de capturar. Sem leitura local
            // as colunas ficam fora do payload e não apagam a da nuvem.
            ...assetGpsColumns(record),
            currentCampaignId: record.currentCampaignId !== undefined && record.currentCampaignId !== null ? String(record.currentCampaignId).trim() : null,
            // CONFERÊNCIA (quem e quando): sem estas três colunas o ativo subia,
            // mas a nuvem nunca sabia que ele tinha sido conferido no aparelho.
            // A flag local sobe pela MESMA regra das leituras (`isConferido`),
            // que aceita booleano, 1/0, `'1'`/`'true'` e a coluna da base
            // (`AUDITOR_STATUS_CONFERENCIA = 'SIM'`). Antes só valia
            // `Number(_conferido) === 1`: conferido no aparelho como `true` (ou
            // conferido pela planilha) subia PENDENTE e a nuvem ficava sem a
            // conferência. O `status` textual continua a valer pelo mesmo
            // motivo de sempre: é o marcador legado que a planilha/ERP traz e
            // que a nuvem lê (`status = 'CONFERIDO'`).
            conferido:
              isConferido(record) ||
              String(record.status || '').toUpperCase().includes('CONFERIDO'),
            auditor: record._auditor !== undefined && record._auditor !== null ? String(record._auditor).trim() || null : null,
            data_leitura: record._dataLeitura !== undefined && record._dataLeitura !== null ? String(record._dataLeitura) : null,
            // EXCLUSÃO: o registo apagado neste aparelho sobe com a flag. Sem
            // ela a nuvem mantinha a linha viva e o ativo voltava a aparecer em
            // todos os aparelhos (e neste, ao reiniciar).
            is_deleted: normalizeFlag(record._is_deleted)
          };

          // CONFLITO POR CAMPO: o grupo que a nuvem ganhou sai do payload. O
          // `ON CONFLICT DO UPDATE` só toca nas colunas enviadas, por isso a
          // conferência (ou o ponto) da nuvem fica intacta.
          if (!conflito.conferencia.enviar) {
            // O `status` viaja com a conferência: mandar um «PENDENTE» local
            // ao lado do `conferido = true` da nuvem era a divergência do
            // bloco B.1 do diagnóstico.
            delete payload.conferido;
            delete payload.auditor;
            delete payload.data_leitura;
            delete payload.status;
          }
          if (!conflito.gps.enviar) {
            delete payload.gps_lat;
            delete payload.gps_lng;
          }

          // O envio repete sem a coluna que a nuvem ainda não tem (PGRST204), em
          // vez de rejeitar o ativo inteiro por causa de `conferido`/`auditor`/
          // `data_leitura` (scripts/assets-conferencia.sql). O alvo de conflito
          // acompanha todas as tentativas: sem ele o upsert vira INSERT.
          let supabaseErr: { message?: string; status?: string | number; code?: string | number } | null = null;
          for (let attempt = 0; attempt < 4; attempt += 1) {
            // Sem limite de tempo, um pedido pendurado congelava o ciclo
            // inteiro para sempre (o laço nunca voltava e a trava ficava presa).
            const pedido = supabase.from('assets').upsert(payload, {
              onConflict: ASSETS_CONFLICT_TARGET
            });
            const { error } = await withUpsertTimeout<Awaited<typeof pedido>>(
              pedido,
              UPSERT_TIMEOUT_MS
            );
            supabaseErr = error;
            if (!error) break;
            const message = String(error.message || '');
            const missingColumn = /'([a-zA-Z0-9_]+)' column/.exec(message)?.[1]
              || /column "([a-zA-Z0-9_]+)"/.exec(message)?.[1];
            if (!missingColumn || !(missingColumn in payload)) break;
            logger.warn(`>>> [Sync] Coluna "${missingColumn}" não existe na nuvem — reenviando sem ela.`);
            delete payload[missingColumn];
          }

          if (!supabaseErr) {
            syncedPrimaryKeys.push(String(pKey));
            // Progresso gravado no instante do sucesso: sobrevive a qualquer
            // interrupção dos registos seguintes. O que a nuvem ganhou por
            // tempo vem no mesmo passo (`extra`), para o registo local não
            // ficar a mostrar uma conferência que a nuvem já substituiu.
            const adotar = { ...conflito.conferencia.adotar, ...conflito.gps.adotar };
            await markRecordSynced(
              String(pKey),
              Object.keys(adotar).length > 0 ? adotar : undefined
            );
            if (conflito.conflitos.length > 0) {
              // Rótulos legíveis: o operador lê a trilha, não o token do tipo.
              const grupos = conflito.conflitos
                .map((grupo) => (grupo === 'conferencia' ? 'conferência' : 'ponto de GPS'))
                .join(' + ');
              const detalhe = conflito.conferencia.enviar && conflito.gps.enviar
                ? `Conflito de sincronização (${grupos}): a leitura deste aparelho é a mais recente e subiu.`
                : `Conflito de sincronização (${grupos}): a leitura da nuvem é a mais recente e ficou; o registo local adotou-a e o resto do ativo subiu deste aparelho.`;
              try {
                conflictSignatures ??= await loadRecentSyncAuditSignatures(SYNC_CONFLICT_AUDIT);
                await auditSyncRecordFailure(
                  user.id,
                  SYNC_CONFLICT_AUDIT,
                  String(pKey),
                  detalhe,
                  conflictSignatures
                );
              } catch (auditErr) {
                logger.warn('>>> [Sync Audit] Falha ao registrar o conflito por campo:', auditErr);
              }
            }
          } else {
            failedPrimaryKeys.push(String(pKey));
            failedRecords.push(record as unknown as RegistoParaOutbox);
            const errObj = supabaseErr as { status?: string | number; code?: string | number; message?: string };
            const statusStr = errObj.status || errObj.code || 'SYNC_FAIL';
            const baseDetails = `Erro Supabase: [${statusStr}] ${supabaseErr.message || JSON.stringify(supabaseErr)}`;
            // 42P10: a nuvem não tem índice único em (tenantid, primarykey) e o
            // ON CONFLICT não encontra alvo. Repetir o ciclo não resolve — o
            // operador precisa de criar o índice (docs/supabase_bootstrap.sql).
            // A acção vem primeiro: o motivo do selo é cortado aos 90 caracteres
            // e é essa frase que o operador precisa de ler.
            const detailsStr = String(errObj.code) === '42P10'
              ? `Erro Supabase: [42P10] falta o índice único (tenantid, primarykey) na nuvem — ${supabaseErr.message || 'ON CONFLICT sem alvo'}`
              : baseDetails;
            
            logger.warn(`>>> [Sync Isolator] Erro Supabase detectado silenciosamente para chave ${pKey}:`, detailsStr);
            await marcarFalhaNoRegisto(String(pKey), detailsStr, record as unknown as Record<string, unknown>);

            try {
              failureSignatures ??= await loadRecentSyncAuditSignatures(SYNC_RECORD_FAIL_AUDIT);
              await auditSyncRecordFailure(user.id, SYNC_RECORD_FAIL_AUDIT, String(pKey), detailsStr, failureSignatures);
            } catch (auditErr) {
              logger.warn('>>> [Sync Audit] Falha ao registrar a recusa do registo:', auditErr);
            }
          }
        } catch (err: unknown) {
          failedPrimaryKeys.push(String(pKey));
          failedRecords.push(record as unknown as RegistoParaOutbox);
          const errMsg = err instanceof Error ? err.message : String(err);

          // TIMEOUT ≠ RECUSA. O servidor pode só não ter respondido em 15 s
          // (4G a mudar de célula, ecrã bloqueado, lock de linha). Carimbar
          // aqui `_syncFailAt` pintava o cartão de «Falha de envio» e o
          // operador lia «Tempo esgotado» 14 min depois como recusa de dados
          // (ecrãs de 2026-11-19). O registo fica «Pendente Nuvem» — que é o
          // que ele é — e a tentativa fica na trilha, sem selo vermelho.
          if (isSyncTimeoutError(err)) {
            logger.warn(
              `>>> [Sync Isolator] Servidor não respondeu para ${pKey} (${errMsg}) — nova tentativa automática, sem carimbo de recusa.`
            );
            // Sem a mensagem do erro dentro do motivo: ela muda com o limite e
            // o motivo do selo é curto; o que o operador precisa de saber é
            // que houve nova tentativa e que o registo não foi recusado.
            const timeoutDetails = `Servidor não respondeu ao envio em ${Math.round(UPSERT_TIMEOUT_MS / 1000)} s — nova tentativa automática`;
            try {
              exceptionSignatures ??= await loadRecentSyncAuditSignatures(SYNC_RECORD_EXCEPTION_AUDIT);
              await auditSyncRecordFailure(
                user.id,
                SYNC_RECORD_EXCEPTION_AUDIT,
                String(pKey),
                timeoutDetails,
                exceptionSignatures
              );
            } catch (auditErr) {
              logger.warn('>>> [Sync Audit] Falha ao registrar o timeout do registo:', auditErr);
            }
            // Não insiste nos restantes registos: 200 ativos × 15 s seriam 50
            // minutos de ciclo preso com o servidor mudo. O ciclo de 60 s
            // volta a tentar e o botão manual continua disponível.
            break;
          }

          logger.warn(`>>> [Sync Isolator] Exceção capturada silenciosamente para chave ${pKey}:`, errMsg);

          const exceptionDetails = `Exceção ao sincronizar registro: ${errMsg}`;
          await marcarFalhaNoRegisto(String(pKey), exceptionDetails, record as unknown as Record<string, unknown>);
          try {
            exceptionSignatures ??= await loadRecentSyncAuditSignatures(SYNC_RECORD_EXCEPTION_AUDIT);
            await auditSyncRecordFailure(
              user.id,
              SYNC_RECORD_EXCEPTION_AUDIT,
              String(pKey),
              exceptionDetails,
              exceptionSignatures
            );
          } catch (auditErr) {
            logger.warn('>>> [Sync Audit] Falha ao registrar a excepção do registo:', auditErr);
          }
          
          if (!navigator.onLine) break; // Força a saída do laço se o erro foi decorrente de queda de rede físico
        }
      }

      if (failedRecords.length > 0) {
        // Recuo na outbox: a próxima tentativa deste registo não tem de esperar
        // o ciclo de 60 s — e quem ainda não tinha envelope ganha-o aqui, senão
        // continuaria a ser tentado a cada ciclo. Best-effort: nunca altera o
        // resultado do ciclo.
        try {
          await marcarFalhasOutbox(failedRecords, 'envio recusado ou interrompido no ciclo');
        } catch (outboxErr) {
          logger.warn('>>> [Outbox] Falha ao registar o recuo dos envios falhados:', outboxErr);
        }
      }

      // A marcação `_is_synced = 1` já aconteceu registro a registro, no ponto
      // em que cada upsert foi confirmado (ver `markRecordSynced`). Antes o
      // lote era aplicado só aqui, no fim: uma quebra a meio perdia o progresso.
      if (syncedPrimaryKeys.length > 0) {
        logger.info(`>>> [Sync ACID Engine] ${syncedPrimaryKeys.length} registro(s) marcados como sincronizados no aparelho.`);
      }

      // 4. EXPURGAMENTO DE LOGS (DISK SATURATION GUARD): Limpar histórico antigo via Dexie API para evitar entupimento de disco.
      //    As recusas de envio ficam: são a prova de por que o ativo não subiu
      //    (`services/auditoriaRetencao.ts`).
      try {
        logger.info(">>> [Disk Saturation Guard] Executando expurgo de logs antigos via Dexie...");
        const expurgo = await purgarAuditoriaAntiga();
        logger.info(
          `>>> [Disk Saturation Guard] Expurgo concluído: ${expurgo.apagadas} linha(s) anteriores a ${expurgo.limite}; ` +
          `${expurgo.preservadas} sem confirmação da nuvem preservadas até ${expurgo.limiteSeguranca}; falhas de envio preservadas.`
        );
      } catch (logErr) {
        logger.warn(">>> [Disk Saturation Guard] Erro silencioso ao expurgar logs:", logErr);
      }

      return {
        success: failedPrimaryKeys.length === 0,
        processedCount: syncedPrimaryKeys.length,
        failedCount: failedPrimaryKeys.length
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(">>> [Sync Service Engine] Falha catastrófica na fila de dados:", msg);
      return { success: false, processedCount: 0, error: msg };
    }
  },

  backupContingencyLocal: async (): Promise<boolean> => {
    const user = getUserFromLocalStorage();
    const rawTenant = user ? resolveTenantId(user) : null;
    const rawFilial = readActiveFilial();

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      return false;
    }

    const tenantidClean = String(rawTenant).trim();
    const filialClean = String(rawFilial).trim();

    try {
      // Busca local_assets onde filial é igual a filialClean, e filtra por tenantid em memória (apenas filial é indexado)
      const list = await db.local_assets.where('filial').equals(filialClean).toArray();
      const filtered = list.filter(item => 
        readLegacyRecordTenant(item).trim().toUpperCase() === tenantidClean.toUpperCase()
      );
      
      const backupKey = `gbr_backup_${tenantidClean.toUpperCase()}_${filialClean.toUpperCase()}`;
      localStorage.setItem(backupKey, JSON.stringify(filtered));
      return true;
    } catch (e) {
      logger.error(">>> [Contingency Guard] Erro ao consolidar rascunho físico em localStorage via Dexie:", e);
      return false;
    }
  }
};

/**
 * Processa a sincronização de dados (registros de ativos) entre SQLite e Supabase
 */
export const processDataSyncQueue = async (): Promise<SyncResult> => {
  return await syncService.processDataSyncQueue();
};

/**
 * Retorna o número de ativos aguardando sincronização com a nuvem via Dexie API
 */
export const getUnsyncedAssetsCount = async (): Promise<number> => {
   try {
     const user = getUserFromLocalStorage();
     const rawTenant = user ? resolveTenantId(user) : null;
     const rawFilial = readActiveFilial();
     
     const unsynced = await db.local_assets.where('_is_synced').equals(0).toArray();
     
     if (user && !isStringInvalid(rawTenant) && !isStringInvalid(rawFilial)) {
       const tenantidClean = String(rawTenant).trim().toUpperCase();
       const filialClean = String(rawFilial).trim().toUpperCase();
       const filtered = unsynced.filter(record => {
         const isTenantMatch = readLegacyRecordTenant(record).trim().toUpperCase() === tenantidClean;
         const isFilialMatch = String(record.filial || record._unitid || '').trim().toUpperCase() === filialClean;
         return isTenantMatch && isFilialMatch;
       });
       return filtered.length;
     }
     
     return unsynced.length;
   } catch (e) {
     logger.error(">>> [Sync Guard] Erro ao contar ativos pendentes na tabela local_assets via Dexie, tentando fallbackStore:", e);
     try {
       const assets = await fallbackStore.getItem<Record<string, unknown>[]>('loaded_assets') || [];
       const unsynced = assets.filter(a => a._is_synced === 0 || a._is_synced === false || a.sync_status === 'PENDING');
       return unsynced.length;
     } catch {
       return 0;
     }
   }
};

/**
 * Adiciona uma foto à fila de sincronização offline
 */
export const addToSyncQueue = async (assetId: string, photoBlob: Blob, tenantid: string): Promise<string> => {
  const id = generateUUID();
  const item: SyncQueueItem = {
    id,
    assetId,
    tenantid,
    photoBlob,
    timestamp: Date.now(),
    attempts: 0
  };

  await photoQueueStore.setItem(id, item);
  
  if (navigator.onLine) {
    processSyncQueue().catch(console.error);
  }

  return id;
};

/**
 * Retorna todos os itens pendentes na fila
 */
export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const items: SyncQueueItem[] = [];
  await photoQueueStore.iterate((value: SyncQueueItem) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Retorna o número de itens pendentes na fila
 */
export const getSyncQueueLength = async (): Promise<number> => {
  return await photoQueueStore.length();
};

/**
 * Remove um item específico da fila
 */
export const removeItemFromQueue = async (id: string): Promise<void> => {
  await photoQueueStore.removeItem(id);
};

/**
 * Limpa a fila
 */
export const clearSyncQueue = async (): Promise<void> => {
  await photoQueueStore.clear();
};

/**
 * Processa a fila de sincronização de fotos (alias para manter compatibilidade com componentes)
 */
export const processSyncQueue = async (): Promise<void> => {
  if (isSyncingLoopActive) {
    logger.warn(">>> [Sync Alias Guard] Concurrency prevented: a sync loop is already running.");
    return;
  }
  
  const safe = await checkHardwareSafety();
  if (!safe) {
    logger.warn(">>> [Sync Guard] Gravação física abortada preventivamente devido à bateria baixa (< 5%).");
    return;
  }

  isSyncingLoopActive = true;
  try {
    logger.info(">>> [Sync Alias] Starting sequential manual synchronization...");
    await syncService.processDataSyncQueue().catch(console.error);
    await photoSyncManager.processPhotoSyncQueue().catch(console.error);
    // F2: a trilha de auditoria sobe depois do que ela descreve (o registo só
    // pode ser enviado quando o ativo que ele conta já foi aceite).
    await enviarFilaAuditoria().catch(console.error);
  } finally {
    isSyncingLoopActive = false;
  }
};

/**
 * Executa de forma exposta a sincronização resilient de fotos das filas
 */
export const processPhotoSyncQueue = async (): Promise<{ success: boolean; uploadCount: number; failedCount: number }> => {
  if (isSyncingLoopActive) return { success: false, uploadCount: 0, failedCount: 0 };
  
  const safe = await checkHardwareSafety();
  if (!safe) {
    logger.warn(">>> [Sync Guard] Gravação física abortada preventivamente devido à bateria baixa (< 5%).");
    return { success: false, uploadCount: 0, failedCount: 0 };
  }

  isSyncingLoopActive = true;
  try {
    return await photoSyncManager.processPhotoSyncQueue();
  } finally {
    isSyncingLoopActive = false;
  }
};

const scheduleNextCycle = () => {
  let nextDelay = 30000; // 30 segundos padrão
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    nextDelay = 300000; // 5 minutos de resguardo para poupar bateria
    logger.error(`>>> [Sync Loop SRE] Sistema em avaria severa cumulativa. Backoff de segurança (5 minutos) ativado.`);
  }
  setTimeout(runSyncLoopCycle, nextDelay);
};

const runSyncLoopCycle = async () => {
  if (!canPushToCloud()) {
    scheduleNextCycle();
    return;
  }
  if (isSyncingLoopActive) return;
  
  const safe = await checkHardwareSafety();
  if (!safe) {
    scheduleNextCycle();
    return;
  }

  // Barreira de guarda para evitar loops infinitos de sincronização antes do operador estar logado
  const user = getUserFromLocalStorage();
  const rawFilial = readActiveFilial();
  if (!user || isStringInvalid(rawFilial)) {
    // Retorna silenciosamente e agenda o próximo ciclo sem incrementar falhas
    scheduleNextCycle();
    return;
  }

  isSyncingLoopActive = true;
  
  let hasFailure = false;
  
  try {
    if (navigator.onLine) {
      logger.info(">>> [Sync Loop] Ativando ciclo sequencial de sincronização SRE...");
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.warn(`>>> [Sync Loop Guard] Limite de falhas consecutivas atingido (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}). Prorrogando ciclo para poupar bateria.`);
        hasFailure = true;
        return;
      }

      await syncService.processDataSyncQueue().catch(err => {
        logger.error(">>> [Sync Loop] Falha no ciclo de sincronização de dados:", err);
        hasFailure = true;
      });
      await photoSyncManager.processPhotoSyncQueue().catch(err => {
        logger.error(">>> [Sync Loop] Falha no ciclo de sincronização de fotos:", err);
        hasFailure = true;
      });
      await processCampaignSyncQueue().catch(err => {
        logger.error(">>> [Sync Loop] Falha no ciclo de sincronização de campanhas:", err);
        hasFailure = true;
      });
      // F2: a trilha local é durável e sobe em lotes idempotentes. Uma falha
      // daqui NÃO entra no backoff: a trilha não é o dado operacional, e os
      // eventos ficam carimbados na fila para o próximo ciclo.
      await enviarFilaAuditoria().catch(err => {
        logger.error(">>> [Sync Loop] Falha na fila da trilha de auditoria:", err);
      });
    }
  } catch (err) {
    logger.error(">>> [Sync Loop] Erro fatal no ciclo de sincronização geral:", err);
    hasFailure = true;
  } finally {
    isSyncingLoopActive = false;
    
    if (hasFailure) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    scheduleNextCycle();
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Evita loop infinito e executa somente se não estiver ativo no momento
    if (!isSyncingLoopActive) {
      consecutiveFailures = 0;
      runSyncLoopCycle().catch(console.error);
    }
  });

  // Agenda a primeira execução com delay estratégico após inicialização da WebView
  setTimeout(runSyncLoopCycle, 10000);
}

export const syncService = new Proxy(_syncService, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(target);
    }
    return value;
  }
});

export default syncService;
