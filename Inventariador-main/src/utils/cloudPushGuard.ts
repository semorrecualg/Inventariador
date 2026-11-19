import { assetIdentityKey, type DedupRow } from './dedupAssets';

/**
 * GUARDA DE ENVIO PARA A NUVEM (Supabase).
 *
 * A tabela `assets` guarda uma linha por `(tenantid, primarykey)`. Duas linhas
 * da planilha com a mesma etiqueta (`tenantid + filial + etiqueta` iguais, cada
 * uma com a sua `primarykey` de origem) são registos DISTINTOS e sobem as duas —
 * apagá-las ou recusá-las seria perder registo, que é o que o produto proíbe.
 *
 * O que a guarda recusa é outra coisa: o MESMO registo duas vezes no payload
 * (mesmo `tenantid` e mesma `primarykey`). O upsert `onConflict(tenantid, id)`
 * aborta o lote inteiro com "ON CONFLICT DO UPDATE command cannot affect row a
 * second time", por isso o envelope é recusado antes de tocar na rede.
 *
 * Identidades repetidas continuam a ser medidas e reportadas — é o diagnóstico
 * que mostra quais etiquetas aparecem mais de uma vez na planilha — mas como
 * informação, não como bloqueio.
 */

export interface CloudPushFilialAudit {
  /** Rótulo legível da filial (primeira linha do grupo). */
  filial: string;
  /** Linhas dessa filial na base a enviar. */
  rows: number;
  /** Identidades distintas dessa filial. */
  identities: number;
  /** Linhas a mais para a mesma identidade nessa filial. */
  copies: number;
}

export interface CloudPushAudit {
  /** Linhas que seriam enviadas. */
  total: number;
  /** Identidades distintas (tenantid + filial + etiqueta). */
  identities: number;
  /** Grupos com mais de uma linha. */
  groupsWithCopies: number;
  /** Linhas a mais para a mesma identidade (registos distintos da planilha). */
  copies: number;
  /** Linhas sem etiqueta: não têm identidade, não entram no agrupamento. */
  withoutIdentity: number;
  perFilial: CloudPushFilialAudit[];
}

/** O mesmo registo (`tenantid` + `primarykey`) repetido no payload. */
export interface DuplicateRecord {
  tenantid: string;
  primarykey: string;
  count: number;
}

export interface CloudPushGuardResult {
  blocked: boolean;
  audit: CloudPushAudit;
  /** Chaves repetidas no payload — o motivo de bloqueio. */
  duplicates: DuplicateRecord[];
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

/** Mede os grupos com a mesma identidade na base que se pretende enviar. Não escreve nada. */
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
 * Texto informativo das identidades repetidas. Não bloqueia: cada linha tem a
 * sua `primarykey` de origem, portanto são registos distintos que a nuvem
 * guarda lado a lado.
 */
export function formatIdentityCopiesNotice(audit: CloudPushAudit): string[] {
  if (audit.copies === 0) return [];

  return [
    `Identidades repetidas (tenantid + filial + etiqueta): ${audit.copies} linha(s) a mais em ${audit.groupsWithCopies} grupo(s) — ${audit.total} linhas para ${audit.identities} identidade(s).`,
    'São registos distintos da planilha (primarykey própria em cada linha) e seguem para a nuvem: a tabela guarda uma linha por (tenantid, primarykey).',
    ...audit.perFilial
      .filter((f) => f.copies > 0)
      .map((f) => `${f.filial}: ${f.rows} linhas · ${f.identities} identidade(s) · ${f.copies} repetida(s)`)
  ];
}

/** Chaves (`tenantid` + `primarykey`) que aparecem mais de uma vez no payload. */
export function findDuplicateRecords(rows: DedupRow[]): DuplicateRecord[] {
  const counts = new Map<string, DuplicateRecord>();

  for (const row of rows) {
    const primarykey = String(row.primarykey ?? '').trim();
    if (!primarykey) continue;
    const tenantid = String(row.tenantid ?? '').trim().toUpperCase();
    const key = `${tenantid}\u0000${primarykey}`;
    const found = counts.get(key);
    if (found) found.count += 1;
    else counts.set(key, { tenantid, primarykey, count: 1 });
  }

  return Array.from(counts.values())
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.count - a.count);
}

/** Texto do bloqueio por registo repetido. Fonte única: erro e tela mostram o mesmo. */
export function formatDuplicateRecords(duplicates: DuplicateRecord[]): string[] {
  if (duplicates.length === 0) return [];

  const extra = duplicates.reduce((sum, entry) => sum + entry.count - 1, 0);
  const lines = [
    `ENVIO BLOQUEADO: ${extra} linha(s) repetida(s) do mesmo registo em ${duplicates.length} primarykey(s).`,
    'O envio grava por (tenantid, primarykey) e um lote com a mesma chave duas vezes é recusado pelo Postgres. Nada foi enviado; o registo continua na base local.'
  ];

  duplicates.slice(0, 5).forEach((entry) => {
    lines.push(`contrato ${entry.tenantid || '(sem contrato)'} · primarykey ${entry.primarykey}: ${entry.count} linha(s)`);
  });
  if (duplicates.length > 5) lines.push(`… e mais ${duplicates.length - 5} chave(s).`);

  return lines;
}

/** Decide se o envio pode seguir. Só o mesmo registo repetido bloqueia. */
export function checkCloudPushGuard(rows: DedupRow[]): CloudPushGuardResult {
  const audit = auditCloudPush(rows);
  const duplicates = findDuplicateRecords(rows);
  if (duplicates.length === 0) return { blocked: false, audit, duplicates, message: [] };
  return { blocked: true, audit, duplicates, message: formatDuplicateRecords(duplicates) };
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
 * É DIAGNÓSTICO, não bloqueio: com duas linhas legítimas da planilha para a
 * mesma etiqueta, a segunda chega quando a primeira já está na nuvem e a
 * identidade é a mesma — recusar seria perder a linha. A nuvem guarda uma linha
 * por `(tenantid, primarykey)`, então as duas convivem.
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

/** Texto informativo das identidades já presentes na nuvem. */
export function formatCloudPushIdentityConflicts(conflicts: CloudPushIdentityConflict[]): string[] {
  if (conflicts.length === 0) return [];

  const lines = [
    `Identidade já presente na nuvem com outro primarykey: ${conflicts.length} linha(s) — seguem como registos distintos.`,
    'A conferência aplica-se ao conjunto; o upsert grava por (tenantid, primarykey) e não toca na linha já existente.'
  ];

  conflicts.slice(0, 5).forEach((conflict) => {
    const [, filial, etiqueta] = conflict.key.split('|');
    lines.push(
      `${filial} · etiqueta ${etiqueta}: local ${conflict.attempted} × nuvem ${conflict.existing.join(', ')}`
    );
  });
  if (conflicts.length > 5) lines.push(`… e mais ${conflicts.length - 5} linha(s).`);

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

/** O payload traz o mesmo registo (tenantid + primarykey) mais de uma vez. */
export class CloudPushBlockedError extends CloudPushPolicyError {
  readonly duplicates: DuplicateRecord[];

  constructor(duplicates: DuplicateRecord[]) {
    const lines = formatDuplicateRecords(duplicates);
    super(lines[0] ?? 'Envio bloqueado: registo repetido no lote.', lines);
    this.name = 'CloudPushBlockedError';
    this.duplicates = duplicates;
  }
}

/**
 * Recuo do envio bloqueado por registo repetido.
 *
 * A fila da nuvem volta a tentar sozinha; sem recuo, um bloqueio que só o
 * operador resolve repetia o aviso a cada 1,2 s. Os valores
 * crescem até ao teto e voltam a zero no primeiro envio aceito.
 */
export const CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS = 30_000;
export const CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS = 300_000;

export const nextCloudPushBlockedBackoff = (previousMs: number): number =>
  previousMs > 0
    ? Math.min(previousMs * 2, CLOUD_PUSH_BLOCKED_MAX_BACKOFF_MS)
    : CLOUD_PUSH_BLOCKED_BASE_BACKOFF_MS;
