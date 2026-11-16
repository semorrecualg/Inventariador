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
 * Por isso o envio em massa é bloqueado enquanto existirem grupos com cópias,
 * e o bloqueio apresenta os números que explicam a recusa.
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

/** Decide se o envio pode seguir. Com qualquer cópia, bloqueia e explica. */
export function checkCloudPushGuard(rows: DedupRow[]): CloudPushGuardResult {
  const audit = auditCloudPush(rows);
  if (audit.copies === 0) return { blocked: false, audit, message: [] };

  return {
    blocked: true,
    audit,
    message: [
      `ENVIO BLOQUEADO: ${audit.copies} cópia(s) repetida(s) em ${audit.groupsWithCopies} grupo(s) — ${audit.total} linhas para ${audit.identities} ativos distintos (tenantid + filial + etiqueta).`,
      'A nuvem guarda uma linha por identidade: enviar esta base recria as cópias em todos os dispositivos.',
      'Execute CÓPIAS REPETIDAS → LIMPAR CÓPIAS (a conferência é preservada) e confira os três espelhos antes de enviar.',
      ...audit.perFilial.map(
        (f) => `${f.filial}: ${f.rows} linhas · ${f.identities} identidade(s) · ${f.copies} cópia(s)`
      )
    ]
  };
}
