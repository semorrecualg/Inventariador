/**
 * NORMALIZE.TS — Regras canônicas de higienização de valores e chaves (Fase C).
 *
 * Contrato: docs/PLANO_FASE_C_HIGIENIZACAO.md (§1.1, §2) e
 * docs/HIGIENIZACAO_ENDERECO.md (§6.2).
 *
 * Regras aprovadas por classe:
 * - Classe K (código/chave): UPPER + TRIM + expurgo `[^A-Z0-9-]` — espelha o
 *   padrão canônico já existente no app (addressParser / persistenceService:
 *   `trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')`).
 * - Classe T (texto descritivo): TRIM + colapso de espaços, **caixa preservada**.
 * - filial: UPPER + TRIM preservando espaços internos (deviação SRE
 *   documentada — nomes físicos como "010101 CICOPAL GO" são vinculados a
 *   `unit_configs` por match com espaço; o expurgo quebraria o vínculo).
 * - N/D/F: coerções da C3 — aqui apenas TRIM, sem case/expurgo.
 *
 * Transição tolerante: `pickCanonical` mantém a leitura híbrida (canônico
 * minúsculo vence; UPPER é fallback) DURANTE a Fase C; removido na C5.
 */
import { CANONICAL_KEY_MAP } from '../constants/schema';

/**
 * Flag de segurança do rollout (decisão §9.2 do plano Fase C): se `false`, a
 * etapa de DADOS da migração `version(5)` é pulada, mantendo apenas a mudança
 * de código (rollback instantâneo).
 */
export const NORMALIZE_ON_UPGRADE = true;

/**
 * Regra Classe K: `UPPER + TRIM + expurgo [^A-Z0-9-]`.
 * `null`/`undefined` → `null`; string vazia permanece vazia.
 */
export function normalizeClassK(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/**
 * Regra Classe T: `TRIM + colapso de espaços`, caixa preservada.
 * `null`/`undefined` → `null`.
 */
export function normalizeClassT(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim().replace(/\s+/g, ' ');
}

/**
 * `UPPER + TRIM` preservando espaços internos — regra do campo `filial`
 * (deviação SRE documentada no plano §3.4).
 */
export function normalizeUpperTrim(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim().toUpperCase();
}

/**
 * Leitura tolerante durante a transição: o canônico minúsculo vence; a chave
 * UPPER é fallback; `null` quando nenhuma variante existe. Substitui as
 * leituras híbridas (`ENDERECO || endereco`) e as normalizações
 * `toUpperCase().trim()` espalhadas.
 */
export function pickCanonical(rec: Record<string, unknown>, lowerKey: string): unknown {
  const upper = lowerKey.toUpperCase();
  return rec[lowerKey] ?? rec[upper] ?? null;
}

/**
 * Resolve qualquer variante de chave (UPPER/mixed/typo de cabeçalho) para a
 * chave canônica minúscula do contrato, via `CANONICAL_KEY_MAP`. Chaves
 * desconhecidas retornam como estão (identidade — nunca quebra).
 */
export function canonicalKey(key: string): string {
  if (!key) return key;
  return CANONICAL_KEY_MAP[key.toUpperCase()] ?? key;
}

// --- Regra por classe de campo (plano Fase C §2; decisões §9) --------------

/** Identidade/PK — C1: TRIM apenas; política de normalização definida na C4 (version(5)). */
const CLASS_K_IDENTITY_FIELDS = new Set(['etiqueta', 'tag', 'primarykey']);
/** Campos K de código — expurgo `[^A-Z0-9-]` aprovado. */
const CLASS_K_CODE_FIELDS = new Set([
  'endereco', 'serial', 'registro', 'subreg', 'contacontabil',
  'centrodecusto', 'cnpj', 'notafiscal'
]);
/** Classe T — caixa preservada. */
const CLASS_T_FIELDS = new Set(['descricaodoativo', 'nomefornecedor', 'status']);
/** filial — UPPER + TRIM com espaços internos preservados. */
const CLASS_FILIAL_FIELDS = new Set(['filial']);

/**
 * Aplica a regra de normalização da classe do campo canônico. É o primitivo
 * compartilhado entre o loader (M1 — carga) e a migração `version(5)` (C4 —
 * dados existentes), garantindo que ambos usem a MESMA regra por campo.
 * `null`/`undefined`/vazio → `null` (semântica de campo ausente do Dexie).
 */
export function normalizeFieldValue(field: string, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let out: string;
  if (CLASS_FILIAL_FIELDS.has(field)) {
    out = normalizeUpperTrim(raw) ?? '';
  } else if (CLASS_K_CODE_FIELDS.has(field)) {
    out = normalizeClassK(raw) ?? '';
  } else if (CLASS_T_FIELDS.has(field) || CLASS_K_IDENTITY_FIELDS.has(field)) {
    out = normalizeClassT(raw) ?? '';
  } else {
    // N/D/F: coerções numéricas/de data/flags são da C3 — aqui apenas TRIM.
    out = String(raw).trim();
  }
  return out === '' ? null : out;
}
