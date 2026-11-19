// ============================================================================
// assetIdentity.ts — IDENTIDADE INTERNA DO ATIVO (Fase 2 da carga).
//
// Regra do produto: NENHUMA linha da planilha pode ser eliminada. A coluna
// `primarykey` do arquivo é DADO DE ORIGEM, não identidade: duas linhas podem
// trazer a mesma `primarykey` (ou nenhuma) e, com a chave a ser copiada do
// arquivo, a segunda linha substituía a primeira no `bulkPut` — a planilha
// perdia registos.
//
// A identidade passa a ser INTERNA e derivada, como pedido:
//
//   1. base = `primarykey` da planilha, canonizada (só A-Z, 0-9, `-`);
//   2. sem `primarykey`, base = `etiqueta`/`tag`;
//   3. sem qualquer identidade, base = impressão digital do conteúdo;
//   4. base única no arquivo → identidade = base (mantém a continuidade da base
//      e da nuvem que já usam essa chave);
//   5. base REPETIDA no arquivo → cada linha recebe uma identidade derivada de
//      (base + conteúdo da linha + ocorrência), estável entre reimportações:
//      as duas linhas ficam na base em vez de uma apagar a outra.
//
// A carga é append-only e idempotente: reimportar o mesmo arquivo recalcula
// exatamente as mesmas identidades (nada duplica, nada desaparece). O valor
// literal da coluna fica em `source_primarykey` e a linha física em
// `source_row`, para rastrear cada registo até à planilha.
// ============================================================================
import { contentFingerprint, fallbackAssetKey, sanitizeAssetKey } from './assetKey';

/** Coluna da planilha que sustentou a identidade interna. */
export type AssetIdentityOrigin = 'PRIMARYKEY' | 'ETIQUETA' | 'CONTEUDO';

export interface AssetIdentity {
  /** Identidade INTERNA (chave do registo na base) — nunca é o texto da célula. */
  primarykey: string;
  /** Coluna de origem usada como base. */
  origin: AssetIdentityOrigin;
  /** Base canónica antes do desempate (diagnóstico/relatório). */
  base: string;
}

/** Valores de origem de uma linha da planilha. */
export interface AssetIdentityCandidate {
  tenantid?: unknown;
  filial?: unknown;
  /** Coluna `primarykey` da planilha, na íntegra. */
  sourcePrimarykey?: unknown;
  etiqueta?: unknown;
  tag?: unknown;
  /** Linha crua — usada para derivar a chave do conteúdo. */
  row?: Record<string, unknown> | null;
}

const tenantKeyOf = (value: unknown): string => String(value ?? '').trim().toUpperCase();

/** Texto literal da coluna (sem trim, sem mudança de caixa). */
export const sourcePrimarykeyOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text === '' ? null : text;
};

/** Base canónica da identidade — a mesma ordem de sempre: pk → etiqueta → tag. */
export function resolveAssetIdentityBase(candidate: AssetIdentityCandidate): {
  base: string;
  origin: AssetIdentityOrigin;
} {
  const byPrimarykey = sanitizeAssetKey(candidate.sourcePrimarykey);
  if (byPrimarykey) return { base: byPrimarykey, origin: 'PRIMARYKEY' };

  const byEtiqueta = sanitizeAssetKey(candidate.etiqueta) || sanitizeAssetKey(candidate.tag);
  if (byEtiqueta) return { base: byEtiqueta, origin: 'ETIQUETA' };

  return { base: '', origin: 'CONTEUDO' };
}

/**
 * Alocador da carga: precisa de conhecer o arquivo INTEIRO (prime) para saber
 * quais as bases que se repetem antes de decidir a identidade da primeira linha.
 */
export class AssetIdentityAllocator {
  /** Quantas linhas o arquivo traz para cada (contrato + base). */
  private readonly plannedTotals = new Map<string, number>();
  private readonly allocated = new Map<string, number>();
  private readonly pairCounts = new Map<string, number>();

  /** Pré-contagem do arquivo — obrigatória antes de `allocate`. */
  prime(candidates: AssetIdentityCandidate[]): this {
    for (const candidate of candidates) {
      const { base } = resolveAssetIdentityBase(candidate);
      const scope = `${tenantKeyOf(candidate.tenantid)}\u0000${base}`;
      this.plannedTotals.set(scope, (this.plannedTotals.get(scope) ?? 0) + 1);
    }
    return this;
  }

  /** Identidade interna de uma linha. Mesmas linhas ⇒ mesmas identidades. */
  allocate(candidate: AssetIdentityCandidate): AssetIdentity {
    const { base, origin } = resolveAssetIdentityBase(candidate);
    const fingerprint = contentFingerprint(candidate.row);

    if (!base) {
      // Sem identidade no arquivo: chave derivada do conteúdo (determinística).
      return {
        primarykey: this.derived(candidate, `${origin}\u0000${fingerprint}`),
        origin,
        base
      };
    }

    const scope = `${tenantKeyOf(candidate.tenantid)}\u0000${base}`;
    const seen = (this.allocated.get(scope) ?? 0) + 1;
    this.allocated.set(scope, seen);

    const total = this.plannedTotals.get(scope) ?? 1;
    if (Math.max(total, seen) <= 1) {
      return { primarykey: base, origin, base };
    }

    // Base repetida: o desempate vem do CONTEÚDO da linha, não da posição —
    // reordenar as linhas do arquivo não muda a identidade de nenhuma delas.
    return {
      primarykey: this.derived(candidate, `${base}\u0000${fingerprint}`),
      origin,
      base
    };
  }

  private derived(candidate: AssetIdentityCandidate, seed: string): string {
    const occurrence = (this.pairCounts.get(seed) ?? 0) + 1;
    this.pairCounts.set(seed, occurrence);
    return fallbackAssetKey(candidate.tenantid, candidate.filial, seed, occurrence);
  }
}

export const createAssetIdentityAllocator = (): AssetIdentityAllocator => new AssetIdentityAllocator();

let batchCounter = 0;

/**
 * Identificador da carga. Não entra na identidade do ativo (senão reimportar
 * criaria registos novos): serve só para saber de que carga veio a linha.
 */
export const newImportBatchId = (): string => {
  batchCounter += 1;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CARGA-${stamp}-${batchCounter}-${random}`;
};
