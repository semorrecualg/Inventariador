import { db } from './sqliteService';
import type { DexieSyncOutbox } from './sqliteService';
import { sanitizeAssetKey } from '../utils/assetKey';
import { logger } from '../utils/logger';

/**
 * FILA DE SUBIDA DURÁVEL (`sync_outbox`, schema v9)
 * ============================================================================
 * A fila que existia era o próprio ativo marcado com `_is_synced = 0`: durável,
 * mas sem tentativas, sem recuo e sem ordem — dois ciclos a falhar o mesmo
 * registo ficam indistinguíveis, e um registo que a nuvem apagou tem de ser
 * descoberto por leitura remota a cada volta.
 *
 * Esta tabela é o envelope da subida: uma linha por ativo pendente, com
 * `attempts`, `next_attempt_at` e `op` (UPSERT/DELETE). Vive na MESMA base
 * Dexie precisamente para poder ser escrita na MESMA transacção da gravação do
 * ativo — é isso que impede o estado dividido entre «ativo gravado» e «fila por
 * gravar».
 *
 * FASE 1 (esta): a outbox nasce semeada de `_is_synced = 0`, é alimentada pela
 * conferência (`saveCollectedAssetAtomic`) e é limpa quando o envio é aceite.
 * A DRENAGEM CONTINUA A LER `_is_synced` — a outbox é o envelope, não (ainda) a
 * fonte única. Passa a ser a fonte na Fase 2, quando a política de conflito por
 * campo entrar. Nada nesta camada bloqueia o envio: todas as chamadas do ciclo
 * de sync são best-effort (falham para o log, nunca para o chamador).
 */

export type OutboxOp = 'UPSERT' | 'DELETE';
export type OutboxStatus = 'PENDENTE' | 'FALHA';

/** Registo mínimo que a outbox precisa de ler de um ativo. */
export interface RegistoParaOutbox {
  primarykey?: unknown;
  id?: unknown;
  tenantid?: unknown;
  _is_deleted?: unknown;
}

const RECUO_BASE_MS = 30_000;
const RECUO_MAX_MS = 30 * 60_000;

/**
 * Chave canónica da outbox: contrato em caixa alta + chave do ativo, a MESMA
 * regra do muro multi-tenant (`[tenantid+primarykey]`). Serve de chave primária
 * da tabela, por isso `put` é idempotente: reenfileirar o mesmo ativo não cria
 * linha nova, apenas actualiza a existente.
 */
export const chaveOutbox = (tenantid: unknown, primarykey: unknown): string =>
  `${String(tenantid ?? '').trim().toUpperCase()}|${sanitizeAssetKey(String(primarykey ?? ''))}`;

/** Exclusão sobe como DELETE; tudo o resto como UPSERT. */
export const operacaoDe = (registo: RegistoParaOutbox): OutboxOp =>
  Number(registo._is_deleted) === 1 ? 'DELETE' : 'UPSERT';

/** Recuo exponencial com tecto: 30 s, 1 min, 2 min … 30 min. */
export const recuoDe = (attempts: number): number =>
  Math.min(RECUO_MAX_MS, RECUO_BASE_MS * 2 ** Math.min(Math.max(attempts, 0), 6));

/** Converte um ativo no registo de outbox correspondente. */
export const entradaOutbox = (registo: RegistoParaOutbox, agora: Date = new Date()): DexieSyncOutbox => {
  const primarykey = sanitizeAssetKey(String(registo.primarykey ?? registo.id ?? ''));
  const tenantid = String(registo.tenantid ?? '').trim().toUpperCase();
  const iso = agora.toISOString();
  return {
    key: chaveOutbox(tenantid, primarykey),
    primarykey,
    tenantid,
    op: operacaoDe(registo),
    status: 'PENDENTE',
    attempts: 0,
    next_attempt_at: 0,
    created_at: iso,
    updated_at: iso,
    last_error: null
  };
};

/**
 * Enfileira um ativo. Chamado DENTRO da transacção que grava o ativo
 * (`saveCollectedAssetAtomic`) — a tabela tem de estar no escopo dessa
 * transacção, senão o Dexie recusa.
 */
export async function enfileirarOutbox(registo: RegistoParaOutbox): Promise<DexieSyncOutbox> {
  const entrada = entradaOutbox(registo);
  await db.sync_outbox.put(entrada);
  return entrada;
}

/**
 * Semeia a outbox a partir da fila legada (`_is_synced = 0`). Uma vez por
 * sessão: as escritas seguintes entram por `enfileirarOutbox`. Não sobrescreve
 * entradas existentes — um registo que já falhou duas vezes não volta a
 * `attempts = 0` só porque a sessão reiniciou.
 */
let semeadaNestaSessao = false;

export async function semearOutboxDePendentes(forcar = false): Promise<number> {
  if (semeadaNestaSessao && !forcar) return 0;
  semeadaNestaSessao = true;

  let pendentes: RegistoParaOutbox[] = [];
  try {
    pendentes = (await db.local_assets.where('_is_synced').equals(0).toArray()) as unknown as RegistoParaOutbox[];
  } catch (err) {
    logger.warn('[Outbox] Não foi possível ler a fila legada para semear a outbox:', err);
    return 0;
  }
  if (pendentes.length === 0) return 0;

  const existentes = new Set((await db.sync_outbox.toArray()).map((entrada) => entrada.key));
  const novas = pendentes
    .map((registo) => entradaOutbox(registo))
    .filter((entrada) => entrada.key !== '|' && !existentes.has(entrada.key));

  if (novas.length > 0) {
    await db.sync_outbox.bulkPut(novas);
    logger.info(`>>> [Outbox] ${novas.length} pendente(s) da fila legada semeados em sync_outbox.`);
  }
  return novas.length;
}

/** Envio aceite pela nuvem: a entrada sai da outbox. */
export async function marcarEnviadosOutbox(primarykeys: Array<string | null | undefined>): Promise<number> {
  const chaves = Array.from(
    new Set(primarykeys.map((chave) => sanitizeAssetKey(String(chave ?? ''))).filter(Boolean))
  );
  if (chaves.length === 0) return 0;
  return db.sync_outbox.where('primarykey').anyOf(chaves).delete();
}

/**
 * Envio recusado/interrompido: incrementa `attempts` e empurra a próxima
 * tentativa. Só toca em entradas existentes — um registo que nunca passou pela
 * outbox continua a ser tratado pela fila legada.
 */
export async function marcarFalhasOutbox(
  primarykeys: Array<string | null | undefined>,
  motivo: string
): Promise<number> {
  const chaves = Array.from(
    new Set(primarykeys.map((chave) => sanitizeAssetKey(String(chave ?? ''))).filter(Boolean))
  );
  if (chaves.length === 0) return 0;

  const entradas = await db.sync_outbox.where('primarykey').anyOf(chaves).toArray();
  if (entradas.length === 0) return 0;

  const agora = Date.now();
  const atualizadas: DexieSyncOutbox[] = entradas.map((entrada) => {
    const attempts = Number(entrada.attempts || 0) + 1;
    return {
      ...entrada,
      status: 'FALHA' as OutboxStatus,
      attempts,
      next_attempt_at: agora + recuoDe(attempts),
      updated_at: new Date(agora).toISOString(),
      last_error: String(motivo || '').slice(0, 240)
    };
  });
  await db.sync_outbox.bulkPut(atualizadas);
  return atualizadas.length;
}

/** Contagens para diagnóstico (Gestor de Base / selo). Leitura pura. */
export async function resumoOutbox(): Promise<{ pendentes: number; falhas: number; total: number }> {
  const entradas = await db.sync_outbox.toArray();
  const falhas = entradas.filter((entrada) => entrada.status === 'FALHA').length;
  return { pendentes: entradas.length - falhas, falhas, total: entradas.length };
}
