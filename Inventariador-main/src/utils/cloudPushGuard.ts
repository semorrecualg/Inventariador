import { assetIdentityKey, type DedupRow } from './dedupAssets';

/**
 * GUARDA DE ENVIO PARA A NUVEM (Supabase).
 *
 * A tabela `assets` é consolidada: uma linha por `tenantid + filial + etiqueta`.
 * Se um aparelho que ainda tem 12 636 linhas (as 1 195 cópias) enviar a base,
 * o upsert grava os dois `primarykey` de cada grupo e as cópias voltam para
 * TODOS os dispositivos — nenhum pull posterior consegue distinguir a cópia
 * legítima, porque a nuvem não guarda o critério de desempate local
 * (`_is_synced`).
 *
 * Duas defesas, nesta ordem:
 *  1. `checkCloudPushGuard` — recusa um payload com duas linhas da mesma
 *     identidade (a base local ainda tem cópias).
 *  2. `findIdentityConflicts` — recusa uma linha cuja identidade já existe na
 *     nuvem com outro `primarykey`; é o caso que o payload sozinho não vê,
 *     porque o lote traz uma única linha (push delta) e o upsert é por
 *     `(tenantid, id)`, não por identidade.
 *
 * Regras herdadas de `dedupAssets`:
 *  - identidade = `tenantid + filial + etiqueta`, normalizados;
 *  - linha sem etiqueta não tem identidade, fica fora do agrupamento e nunca
 *    provoca bloqueio (não pode colidir com outra linha).
 */

export interface CloudPushFilialAudit {
  /** Rótulo legível da filial (primeira linha do grupo). */
  filial: string;
  /** Linhas dessa filial na base a enviar. */
  rows: number;
  /** Identidades distintas dessa filial. */
  identities: number;
  /** Cópias que a limpeza removeria nessa filial. */
  copies: number;
}

export interface CloudPushAudit {
  /** Linhas que seriam enviadas. */
  total: number;
  /** Identidades distintas (tenantid + filial + etiqueta). */
  identities: number;
  /** Grupos com mais de uma linha. */
  groupsWithCopies: number;
  /** Linhas a mais — o que a limpeza remove. */
  copies: number;
  /** Linhas sem etiqueta: não têm identidade, não bloqueiam. */
  withoutIdentity: number;
  perFilial: CloudPushFilialAudit[];
}

export interface CloudPushGuardResult {
  blocked: boolean;
  audit: CloudPushAudit;
  /** Linhas prontas para o terminal SRE e para o aviso na tela. */
  message: string[];
}

const filialLabelOf = (row: DedupRow): string =>
  String(row.filial_raw || row.filial || '').trim() || '(sem filial)';

interface IdentityBucket {
  rows: number;
  label: string;
  filialKey: string;
}

/** Mede os grupos com cópias na base que se pretende enviar. Não escreve nada. */
export function auditCloudPush(rows: DedupRow[]): CloudPushAudit {
  const buckets = new Map<string, IdentityBucket>();
  let withoutIdentity = 0;

  for (const row of rows) {
    const key = assetIdentityKey(row);
    if (!key) {
      withoutIdentity += 1;
      continue;
    }
    const existing = buckets.get(key);
    if (existing) {
      existing.rows += 1;
    } else {
      buckets.set(key, { rows: 1, label: filialLabelOf(row), filialKey: key.split('|')[1] || '' });
    }
  }

  let groupsWithCopies = 0;
  let copies = 0;
  const perFilialMap = new Map<string, CloudPushFilialAudit>();

  buckets.forEach((bucket) => {
    const filial = perFilialMap.get(bucket.filialKey) || {
      filial: bucket.label,
      rows: 0,
      identities: 0,
      copies: 0
    };
    filial.rows += bucket.rows;
    filial.identities += 1;
    if (bucket.rows > 1) {
      groupsWithCopies += 1;
      copies += bucket.rows - 1;
      filial.copies += bucket.rows - 1;
    }
    perFilialMap.set(bucket.filialKey, filial);
  });

  return {
    total: rows.length,
    identities: buckets.size,
    groupsWithCopies,
    copies,
    withoutIdentity,
    perFilial: Array.from(perFilialMap.values()).sort((a, b) => b.rows - a.rows)
  };
}

/**
 * Texto do bloqueio por cópias. Fonte única: o erro de política e a tela
 * mostram exatamente estas linhas.
 */
export function formatCloudPushAudit(audit: CloudPushAudit): string[] {
  if (audit.copies === 0) return [];

  return [
    `ENVIO BLOQUEADO: ${audit.copies} cópia(s) repetida(s) em ${audit.groupsWithCopies} grupo(s) — ${audit.total} linhas para ${audit.identities} ativos distintos (tenantid + filial + etiqueta).`,
    'A nuvem guarda uma linha por identidade: enviar esta base recria as cópias em todos os dispositivos.',
    'Execute CÓPRIAS REPETIDAS → LIMPAR CÓPIAS (a conferência é preservada) e confira os três espelhos antes de enviar.',
    ...audit.perFilial.map(
      (f) => `${f.filial}: ${f.rows} linhas · ${f.identities} identidade(s) · ${f.copies} cópia(s)`
    )
  ];
}

/** Decide se o envio pode seguir. Com qualquer cópia, bloqueia e explica. */
export function checkCloudPushGuard(rows: DedupRow[]): CloudPushGuardResult {
  const audit = auditCloudPush(rows);
  if (audit.copies === 0) return { blocked: false, audit, message: [] };
  return { blocked: true, audit, message: formatCloudPushAudit(audit) };
}

export interface CloudPushIdentityConflict {
  /** Identidade normalizada: `TENANT|FILIAL|ETIQUETA`. */
  key: string;
  /** `primarykey` que o dispositivo tentou gravar. */
  attempted: string;
  /** `primarykey` com que a identidade já está na nuvem. */
  existing: string[];
}

/**
 * Identidades do payload que já existem na nuvem com outro `primarykey`.
 *
 * É o buraco que a checagem de cópias locais não cobre: com uma única linha suja
 * (push delta), o payload não tem duplicados, mas gravar essa linha cria uma
 * segunda linha para um ativo que a nuvem já tem. Quando a nuvem já contém o
 * `primarykey` enviado, o upsert atualiza a linha certa — não há cópia nova.
 */
export function findIdentityConflicts(
  payload: DedupRow[],
  cloudRows: DedupRow[]
): CloudPushIdentityConflict[] {
  const cloudByIdentity = new Map<string, string[]>();

  for (const row of cloudRows) {
    const key = assetIdentityKey(row);
    if (!key) continue;
    const primarykey = String(row.primarykey ?? '').trim();
    const known = cloudByIdentity.get(key);
    if (!known) cloudByIdentity.set(key, [primarykey]);
    else if (!known.includes(primarykey)) known.push(primarykey);
  }

  const conflicts: CloudPushIdentityConflict[] = [];
  for (const row of payload) {
    const key = assetIdentityKey(row);
    if (!key) continue;
    const existing = cloudByIdentity.get(key);
    if (!existing) continue;
    const attempted = String(row.primarykey ?? '').trim();
    if (existing.includes(attempted)) continue;
    conflicts.push({ key, attempted, existing });
  }

  return conflicts;
}

/** Texto do bloqueio por identidade já existente na nuvem. */
export function formatCloudPushIdentityConflicts(conflicts: CloudPushIdentityConflict[]): string[] {
  if (conflicts.length === 0) return [];

  const lines = [
    `ENVIO BLOQUEADO: ${conflicts.length} ativo(s) com identidade (tenantid + filial + etiqueta) já presente na nuvem sob outro primarykey.`,
    'Enviar gravaria uma segunda linha para o mesmo ativo. Puxe a base para adotar as linhas da nuvem, ou execute CÓPIAS REPETIDAS → LIMPAR CÓPIAS antes de enviar.'
  ];

  conflicts.slice(0, 5).forEach((conflict) => {
    const [, filial, etiqueta] = conflict.key.split('|');
    lines.push(
      `${filial} · etiqueta ${etiqueta}: local ${conflict.attempted} × nuvem ${conflict.existing.join(', ')}`
    );
  });
  if (conflicts.length > 5) lines.push(`… e mais ${conflicts.length - 5} ativo(s).`);

  return lines;
}

/**
 * Erro de política, não de rede: o payload não pode subir e repetir a tentativa
 * não resolve. Os chamadores distinguem-no de uma falha de rede para fazer
 * recuo em vez de nova tentativa imediata.
 */
export class CloudPushPolicyError extends Error {
  /** Linhas do aviso, para o terminal e para a tela. */
  readonly lines: string[];

  constructor(message: string, lines: string[]) {
    super(message);
    this.name = 'CloudPushPolicyError';
    this.lines = lines;
  }
}

/** A base local ainda tem cópias (mesma identidade duas vezes no payload). */
export class CloudPushBlockedError extends CloudPushPolicyError {
  constructor(audit: CloudPushAudit) {
    const lines = formatCloudPushAudit(audit);
    super(lines[0] ?? 'Envio bloqueado por cópias locais.', lines);
    this.name = 'CloudPushBlockedError';
  }
}

/** A identidade já existe na nuvem com outro `primarykey`. */
export class CloudPushIdentityConflictError extends CloudPushPolicyError {
  readonly conflicts: CloudPushIdentityConflict[];

  constructor(conflicts: CloudPushIdentityConflict[]) {
    const lines = formatCloudPushIdentityConflicts(conflicts);
    super(lines[0] ?? 'Envio bloqueado por identidade já existente na nuvem.', lines);
    this.name = 'CloudPushIdentityConflictError';
    this.conflicts = conflicts;
  }
}

/**
 * Recuo do envio bloqueado por cópias.
 *
 * A fila da nuvem volta a tentar sozinha; sem recuo, um bloqueio que só o
 * operador resolve (LIMPAR CÓPIAS) repetia o aviso a cada 1,2 s. Os valores
 * crescem até ao teto e voltam a zero no primeiro envio aceito.
 */
export const CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS = 30_000;
export const CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS = 300_000;

export const nextCloudPushBlockedBackoff = (previousMs: number): number =>
  previousMs > 0
    ? Math.min(previousMs * 2, CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS)
    : CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS;
