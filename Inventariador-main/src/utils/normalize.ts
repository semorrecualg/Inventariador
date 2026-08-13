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
 * Leitura tolerante: `pickCanonical` (canônico minúsculo vence; UPPER é
 * fallback). Após a C5, o uso fica restrito a payloads NÃO migrados:
 *  - `migrationV5.ts` — lê registros legados UPPER durante o upgrade version(5);
 *  - `App.tsx` (QR público `decoded`) — etiquetas físicas antigas não migram.
 * Leituras de dados locais são diretas (canônicas desde a C4).
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
  'serial', 'registro', 'subreg', 'contacontabil',
  'centrodecusto', 'cnpj', 'notafiscal'
]);
/** Classe T — caixa preservada. */
const CLASS_T_FIELDS = new Set(['descricaodoativo', 'nomefornecedor', 'status']);
/** Texto exibível em UPPER com espaços internos preservados — `filial` e
 *  `endereco` são nomes físicos legíveis (ex.: "151840 PRODUCAO - PV1 REFRESCO
 *  - ENVASE 1 / 2 CDC 70110"). O expurgo `[^A-Z0-9-]` quebrava a grafia com
 *  separadores da planilha (tudo emendado), prejudicando a identificação do
 *  local a inventariar. */
const CLASS_UPPER_SPACE_FIELDS = new Set(['filial', 'endereco']);

/**
 * Aplica a regra de normalização da classe do campo canônico. É o primitivo
 * compartilhado entre o loader (M1 — carga) e a migração `version(5)` (C4 —
 * dados existentes), garantindo que ambos usem a MESMA regra por campo.
 * `null`/`undefined`/vazio → `null` (semântica de campo ausente do Dexie).
 */
export function normalizeFieldValue(field: string, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let out: string;
  if (CLASS_UPPER_SPACE_FIELDS.has(field)) {
    out = normalizeUpperTrim(raw) ?? '';
  } else if (CLASS_K_CODE_FIELDS.has(field)) {
    out = normalizeClassK(raw) ?? '';
  } else if (CLASS_T_FIELDS.has(field) || CLASS_K_IDENTITY_FIELDS.has(field)) {
    out = normalizeClassT(raw) ?? '';
  } else {
    // Outros campos: apenas TRIM (coerções N/D/F usam os helpers dedicados da C3).
    out = String(raw).trim();
  }
  return out === '' ? null : out;
}

// --- Classe N — coerção numérica segura (C3) ---------------------------------
// `Number(x)` válido e finito → número; caso contrário → `null` (nunca `NaN` no banco).
export function normalizeNumeric(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- Classe D — data canônica ISO `YYYY-MM-DD` (C3) --------------------------
// Aceita `dd/mm/yyyy`, `dd-mm-yyyy` (ano 2 ou 4 dígitos) e ISO; valida o round-trip
// (ex.: 31/02 → inválido) e **preserva o valor original** quando não-parseável
// (contrato risco zero — nunca corrompe texto).
export function normalizeDateISO(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const check = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso) return iso;
  }
  return s;
}

// --- Classe F — flag booleana (C3) --------------------------------------------
// Escritas legadas são mistas: loader grava `0|1`; App.tsx grava `true|false`;
// o sync pode trazer strings. `normalizeFlag` unifica a leitura (zero lógica case).
export function normalizeFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v === null || v === undefined || v === '') return false;
  const n = Number(v);
  if (!Number.isNaN(n)) return n === 1;
  return String(v).trim().toLowerCase() === 'true';
}
