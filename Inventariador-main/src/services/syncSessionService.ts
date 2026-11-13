import localforage from 'localforage';
import type { Asset } from '../types/inventory';
import { logger } from '../utils/logger';

/**
 * F2 — Sessão de sincronização com RECIBO e IDEMPOTÊNCIA.
 *
 * Problema que resolve: hoje o envio empurra os ativos "sujos" e, se a conexão
 * cai no meio, a próxima tentativa reenvia tudo — o auditor nunca sabe se
 * "subiu tudo". O upsert do Postgres é idempotente (não duplica), mas o app não
 * guarda prova nem retoma de onde parou.
 *
 * Aqui cada rodada de envio vira uma SESSÃO persistida:
 *
 *   abrir → filtrar o que esta sessão já aceitou → enviar → registrar aceitos →
 *   fechar com recibo (enviados / aceitos / recusados / recebidos / faltantes)
 *
 * Propriedades:
 *  - **Idempotente**: chave = `tenantid|primarykey`; o que a sessão já aceitou
 *    não é reenviado na retomada.
 *  - **Retomável**: a sessão fica persistida enquanto aberta (janela de 16 h,
 *    um turno noturno com virada de dia). Se o app cair, a próxima rodada
 *    continua de onde parou.
 *  - **Conferível**: o recibo é um registro local com contagem e checksum.
 *
 * Decisões de produto que valem aqui (ver docs/VISAO_MALHA_AUDITORIA_CAMPO.md § 10):
 *  - posse/identidade acompanha a PESSOA (o auditor), não o aparelho;
 *  - retenção de sessões fechadas: 90 dias.
 *
 * Este módulo é o lado "recibo". Ele NÃO substitui o transporte: recebe a função
 * de envio (`sync`) por parâmetro, o que também o torna testável sem rede.
 */

export type SyncSessionStatus = 'OPEN' | 'COMPLETED' | 'PARTIAL' | 'ABORTED';

export interface SyncSessionReceipt {
  /** Ativos que esta sessão se propôs a enviar. */
  sent: number;
  /** Ativos aceitos pela nuvem. */
  accepted: number;
  /** Ativos recusados/erro. */
  rejected: number;
  /** Ativos baixados da nuvem no mesmo ciclo. */
  received: number;
  /** Ativos baixados que foram aplicados localmente. */
  applied: number;
  /** Diferença entre enviados e aceitos — o que ainda falta. */
  missing: number;
  /** Impressão determinística das chaves aceitas (conferência, não criptografia). */
  checksum: string;
  durationMs: number;
}

export interface SyncSession {
  id: string;
  tenantid: string;
  filial: string;
  /** Identidade da PESSOA que conduziu o turno. */
  auditor: string;
  deviceId: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  status: SyncSessionStatus;
  attempts: number;
  acceptedKeys: string[];
  rejectedKeys: string[];
  pull?: { since?: string; received: number; applied: number };
  receipt?: SyncSessionReceipt;
}

/** Armazenamento mínimo — permite injetar memória nos testes. */
export interface SyncSessionStore {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
}

const SESSIONS_KEY = 'gbr_sync_sessions';
const DEVICE_KEY = 'gbr_sync_device_id';
const MAX_KEPT_SESSIONS = 20;

/** Janela de retomada: um turno noturno de 12 h com virada de dia (decisão: 16 h). */
export const SYNC_SESSION_RESUME_WINDOW_MS = 16 * 60 * 60 * 1000;

/** Retenção de sessões fechadas (decisão de produto: 90 dias). */
export const SYNC_SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const defaultStore: SyncSessionStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: 'gbr_sync_sessions',
});

const resolveStore = (store?: SyncSessionStore): SyncSessionStore => store ?? defaultStore;

const newId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const readSessions = async (store: SyncSessionStore): Promise<SyncSession[]> => {
  try {
    const list = await store.getItem<SyncSession[]>(SESSIONS_KEY);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    logger.warn('>>> [Sync Session] Falha ao ler sessões locais:', err);
    return [];
  }
};

const writeSessions = async (store: SyncSessionStore, list: SyncSession[]): Promise<void> => {
  try {
    await store.setItem(SESSIONS_KEY, list.slice(0, MAX_KEPT_SESSIONS));
  } catch (err) {
    logger.warn('>>> [Sync Session] Falha ao gravar sessões locais:', err);
  }
};

/**
 * Identificador estável do aparelho. A posse da sessão é da PESSOA, mas o
 * aparelho entra no recibo para rastrear troca de celular no meio do turno.
 */
export const getDeviceId = async (store?: SyncSessionStore): Promise<string> => {
  const s = resolveStore(store);
  try {
    const existing = await s.getItem<string>(DEVICE_KEY);
    if (existing) return existing;
    const created = newId();
    await s.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return 'dispositivo-desconhecido';
  }
};

/** Chave estável do ativo na sincronização: contrato + chave primária. */
export const assetSyncKey = (asset: Pick<Asset, 'tenantid' | 'primarykey' | 'id'>): string => {
  const tenant = String(asset.tenantid ?? '').trim().toUpperCase();
  const key = String(asset.primarykey ?? asset.id ?? '').trim();
  return `${tenant}|${key}`;
};

/** Impressão determinística (FNV-1a 32 bits) das chaves aceitas. */
export const checksumOf = (keys: string[]): string => {
  const sorted = [...keys].sort();
  let hash = 0x811c9dc5;
  for (const key of sorted) {
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2c; // separador, para "AB"+"C" ≠ "A"+"BC"
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const pruneSessions = (sessions: SyncSession[], now: number = Date.now()): SyncSession[] =>
  sessions.filter(s => {
    if (s.status === 'OPEN') return true;
    const finished = Date.parse(s.finishedAt || s.updatedAt || s.startedAt);
    if (!Number.isFinite(finished)) return false;
    return now - finished <= SYNC_SESSION_RETENTION_MS;
  });

export interface OpenSessionOptions {
  tenantid: string;
  filial?: string;
  auditor?: string;
  store?: SyncSessionStore;
  now?: number;
  /** Janela de retomada; `0` força uma sessão nova. */
  resumeWindowMs?: number;
}

/**
 * Abre a sessão do turno — ou retoma a que ficou aberta para o mesmo
 * [contrato|filial|pessoa] dentro da janela de retomada.
 */
export const openSyncSession = async (options: OpenSessionOptions): Promise<SyncSession> => {
  const store = resolveStore(options.store);
  const now = options.now ?? Date.now();
  const tenantid = String(options.tenantid || '').trim().toUpperCase();
  const filial = String(options.filial || 'GERAL').trim().toUpperCase();
  const auditor = String(options.auditor || 'desconhecido').trim();
  const windowMs = options.resumeWindowMs ?? SYNC_SESSION_RESUME_WINDOW_MS;

  const sessions = pruneSessions(await readSessions(store), now);

  const resumable = sessions.find(
    s =>
      s.status === 'OPEN' &&
      s.tenantid === tenantid &&
      s.filial === filial &&
      s.auditor === auditor &&
      now - Date.parse(s.startedAt) <= windowMs
  );

  if (resumable) {
    resumable.attempts += 1;
    resumable.updatedAt = new Date(now).toISOString();
    await writeSessions(store, sessions);
    logger.info(
      `>>> [Sync Session] Retomando sessão ${resumable.id} (${resumable.acceptedKeys.length} ativo(s) já aceito(s) nesta sessão).`
    );
    return resumable;
  }

  const session: SyncSession = {
    id: newId(),
    tenantid,
    filial,
    auditor,
    deviceId: await getDeviceId(store),
    startedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    status: 'OPEN',
    attempts: 1,
    acceptedKeys: [],
    rejectedKeys: [],
  };

  sessions.unshift(session);
  await writeSessions(store, sessions);
  logger.info(`>>> [Sync Session] Sessão ${session.id} aberta para ${tenantid}|${filial} (${auditor}).`);
  return session;
};

/** Remove do lote o que esta sessão já enviou com sucesso — idempotência. */
export const filterNotAccepted = <T extends Pick<Asset, 'tenantid' | 'primarykey' | 'id'>>(
  session: SyncSession,
  assets: T[]
): T[] => {
  if (session.acceptedKeys.length === 0) return assets;
  const accepted = new Set(session.acceptedKeys);
  return assets.filter(a => !accepted.has(assetSyncKey(a)));
};

const persistSession = async (session: SyncSession, store?: SyncSessionStore): Promise<void> => {
  const s = resolveStore(store);
  const sessions = await readSessions(s);
  const index = sessions.findIndex(item => item.id === session.id);
  session.updatedAt = new Date().toISOString();
  if (index >= 0) sessions[index] = session;
  else sessions.unshift(session);
  await writeSessions(s, sessions);
};

/** Registra as chaves aceitas pela nuvem nesta tentativa. */
export const registerAccepted = async (
  session: SyncSession,
  keys: string[],
  store?: SyncSessionStore
): Promise<SyncSession> => {
  const merged = new Set(session.acceptedKeys);
  keys.forEach(k => merged.add(k));
  session.acceptedKeys = [...merged];
  await persistSession(session, store);
  return session;
};

/** Registra o que a nuvem recusou nesta tentativa (fica para a próxima). */
export const registerRejected = async (
  session: SyncSession,
  keys: string[],
  store?: SyncSessionStore
): Promise<SyncSession> => {
  const merged = new Set(session.rejectedKeys);
  keys.forEach(k => merged.add(k));
  session.rejectedKeys = [...merged];
  await persistSession(session, store);
  return session;
};

/** Registra o que veio da nuvem no ciclo (o recibo cobre os dois sentidos). */
export const registerPull = async (
  session: SyncSession,
  pull: { since?: string; received: number; applied: number },
  store?: SyncSessionStore
): Promise<SyncSession> => {
  session.pull = pull;
  await persistSession(session, store);
  return session;
};

export const buildReceipt = (session: SyncSession, now: number = Date.now()): SyncSessionReceipt => {
  const accepted = session.acceptedKeys.length;
  const rejected = session.rejectedKeys.length;
  const started = Date.parse(session.startedAt);
  return {
    sent: accepted + rejected,
    accepted,
    rejected,
    received: session.pull?.received ?? 0,
    applied: session.pull?.applied ?? 0,
    missing: rejected,
    checksum: checksumOf(session.acceptedKeys),
    durationMs: Number.isFinite(started) ? Math.max(0, now - started) : 0,
  };
};

/**
 * Fecha a sessão, grava o recibo e libera a lista de chaves aceitas (o recibo já
 * tem contagem e checksum; não faz sentido carregar milhares de chaves fechadas).
 */
export const closeSyncSession = async (
  session: SyncSession,
  status: Exclude<SyncSessionStatus, 'OPEN'> = 'COMPLETED',
  store?: SyncSessionStore
): Promise<SyncSession> => {
  const now = Date.now();
  session.status = status;
  session.finishedAt = new Date(now).toISOString();
  session.receipt = buildReceipt(session, now);
  session.acceptedKeys = [];
  session.rejectedKeys = [];

  const s = resolveStore(store);
  const sessions = pruneSessions(await readSessions(s), now);
  const index = sessions.findIndex(item => item.id === session.id);
  if (index >= 0) sessions[index] = session;
  else sessions.unshift(session);
  await writeSessions(s, sessions);
  return session;
};

/** Recibo em uma linha, para o monitor SRE. */
export const formatReceipt = (session: SyncSession): string => {
  const r = session.receipt ?? buildReceipt(session);
  const parts = [
    `enviei ${r.sent}`,
    `aceitos ${r.accepted}`,
    r.rejected > 0 ? `recusados ${r.rejected}` : null,
    // Só fala em "recebi" quando o ciclo teve pull registrado.
    session.pull ? `recebi ${r.received}` : null,
    r.missing > 0 ? `FALTAM ${r.missing}` : 'faltam 0',
  ].filter(Boolean);
  return `>>> [Sync Recibo] ${session.tenantid}|${session.filial} · ${parts.join(' · ')} · conferência ${r.checksum}`;
};

export const listSyncSessions = async (params?: {
  limit?: number;
  store?: SyncSessionStore;
}): Promise<SyncSession[]> => {
  const sessions = pruneSessions(await readSessions(resolveStore(params?.store)));
  return sessions.slice(0, params?.limit ?? MAX_KEPT_SESSIONS);
};

export const getLastSyncSession = async (store?: SyncSessionStore): Promise<SyncSession | null> => {
  const sessions = await listSyncSessions({ limit: 1, store });
  return sessions[0] ?? null;
};

export interface PushWithReceiptOptions {
  auditor?: string;
  filial?: string;
  store?: SyncSessionStore;
  /** Transporte: por padrão o envio real; os testes injetam um dublê. */
  sync?: (assets: Asset[], tenantid?: string) => Promise<string[]>;
  now?: number;
}

export interface PushWithReceiptResult {
  /** Ids locais aceitos pela nuvem (mesmo contrato de `syncAssetsToCloudAndMark`). */
  synced: string[];
  session: SyncSession;
}

/**
 * Envia ativos dentro de uma sessão com recibo.
 *
 * Substitui `syncAssetsToCloudAndMark` nos pontos de envio: mesma saída (`synced`),
 * mas com idempotência entre tentativas e recibo registrado ao final.
 */
export const pushAssetsWithReceipt = async (
  assets: Asset[],
  tenantid: string | undefined,
  options: PushWithReceiptOptions = {}
): Promise<PushWithReceiptResult> => {
  const store = resolveStore(options.store);
  const tenant = String(tenantid || assets[0]?.tenantid || '').trim().toUpperCase();
  const filial =
    options.filial ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('filial') || undefined : undefined) ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('filial') || undefined : undefined) ||
    assets[0]?.filial ||
    'GERAL';

  const session = await openSyncSession({
    tenantid: tenant,
    filial,
    auditor: options.auditor,
    store,
    now: options.now,
  });

  if (assets.length === 0 && session.acceptedKeys.length === 0) {
    await closeSyncSession(session, 'COMPLETED', store);
    return { synced: [], session };
  }

  // IDEMPOTÊNCIA: não reenviar o que ESTA sessão já teve aceito.
  const pending = filterNotAccepted(session, assets);
  if (pending.length === 0) {
    logger.info('>>> [Sync Session] Nada novo a enviar: todos os ativos já foram aceitos nesta sessão.');
    await closeSyncSession(session, 'COMPLETED', store);
    return { synced: [], session };
  }

  const sync = options.sync;
  if (!sync) {
    throw new Error('pushAssetsWithReceipt exige a função de envio (sync).');
  }

  let acceptedLocalIds: string[] = [];
  try {
    acceptedLocalIds = await sync(pending, tenantid);
  } catch (err) {
    // Sessão fica ABERTA de propósito: a próxima rodada retoma e não reenvia
    // o que já foi aceito antes da falha. Relê a versão persistida para não
    // apagar as chaves que outra tentativa registrou no meio do caminho.
    const sessions = await readSessions(store);
    const stored = sessions.find(item => item.id === session.id) ?? session;
    stored.status = 'OPEN';
    await persistSession(stored, store);
    logger.warn('>>> [Sync Session] Envio interrompido; sessão mantida aberta para retomada:', err);
    throw err;
  }

  const byLocalId = new Map(pending.map(a => [String(a.id), a]));
  const acceptedKeys = acceptedLocalIds
    .map(id => byLocalId.get(String(id)))
    .filter((a): a is Asset => Boolean(a))
    .map(assetSyncKey);

  const acceptedSet = new Set(acceptedKeys);
  const rejectedKeys = pending
    .map(assetSyncKey)
    .filter(k => !acceptedSet.has(k));

  await registerAccepted(session, acceptedKeys, store);
  await registerRejected(session, rejectedKeys, store);

  const status: Exclude<SyncSessionStatus, 'OPEN'> =
    rejectedKeys.length === 0 ? 'COMPLETED' : acceptedKeys.length === 0 ? 'ABORTED' : 'PARTIAL';

  await closeSyncSession(session, status, store);
  logger.info(formatReceipt(session));

  return { synced: acceptedLocalIds, session };
};
