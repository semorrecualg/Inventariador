import { uuidV5 } from '../services/uuidV5';

/**
 * CHAVE CANÔNICA DO ATIVO (GBR KARDEK) — regra única de escrita
 * ============================================================================
 * Antes desta função cada caminho normalizava a chave à sua maneira:
 *
 *   `DatabaseLoaderService.injetarDadosEmLotes` → `trim().toUpperCase()`
 *   `DatabaseLoaderService.processExcelFile`    → `trim()` (caixa original)
 *   `persistenceService.saveCollectedAssetAtomic` → `toUpperCase()` + expurgo
 *   `localDbService` / `syncService` / `supabaseService` → `trim()`
 *
 * O mesmo ativo saía com `ABC-1`, `abc-1` e `ABC1` conforme o ecrã que gravava, e
 * como a chave primária local é composta `[tenantid + primarykey]`, cada grafia
 * virava uma LINHA NOVA (a origem das cópias que inflavam a Unidade Operacional:
 * 50 544 onde a nuvem tem 12 636).
 *
 * Regra canônica (a mesma em todos os caminhos):
 *   1. `String(raw)`
 *   2. `trim()`
 *   3. `toUpperCase()`  (a base, a nuvem e a planilha do ERP usam maiúsculas)
 *   4. expurgo de tudo o que não é `A-Z`, `0-9` ou `-`
 *      (espaços, pontos, barras, underscores, acentos)
 *
 * Chave vazia NÃO é inventada aqui: quem grava decide (`resolveAssetKey`), e se
 * a planilha não trouxer nenhuma identidade a chave passa a ser DERIVADA do
 * conteúdo (ver `fallbackAssetKey`), nunca aleatória.
 */

/** Prefixo das chaves derivadas de linha sem identidade na planilha. */
export const FALLBACK_KEY_PREFIX = 'SEM-ETIQUETA';

/** Expurgo canônico: mantém `A-Z`, `0-9` e `-`. */
const KEY_ALLOWED = /[^A-Z0-9-]/g;

export const sanitizeAssetKey = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().toUpperCase().replace(KEY_ALLOWED, '');
};

/** Campos usados para identificar uma linha que não tem chave própria. */
export const CONTENT_KEY_FIELDS = [
  'descricaodoativo',
  'descricao',
  'item',
  'serial',
  'registro',
  'endereco',
  'localizacao',
  'databaixa',
  'dataaqusic',
  'notafiscal',
  'cnpj',
  'contacontabil',
  'centrodecusto',
  'vlraquisic',
  'qt'
] as const;

/**
 * Impressão digital do conteúdo da linha — só o que descreve o ativo.
 * Deliberadamente ignora chaves técnicas (`tenantid`, `filial`, `status`,
 * flags `_*`), para a mesma linha produzir sempre a mesma digital.
 */
export const contentFingerprint = (row: Record<string, unknown> | null | undefined): string => {
  if (!row) return '';
  return CONTENT_KEY_FIELDS.map((field) => sanitizeAssetKey(row[field])).join('|');
};

/**
 * Chave determinística para linha sem `primarykey`/`etiqueta`/`tag`.
 *
 * `uuidV5` (SHA-1 sobre tenantid + filial + impressão digital + ocorrência) dá
 * o mesmo resultado em qualquer aparelho e em qualquer recarga do mesmo
 * arquivo. Antes era `ALT-<random>`: cada carga criava um conjunto novo de
 * linhas para os mesmos ativos, infinitamente.
 *
 * `occurrence` distingue linhas realmente repetidas dentro do MESMO arquivo
 * (duas linhas idênticas = dois ativos), sem introduzir aleatoriedade.
 */
export const fallbackAssetKey = (
  tenantid: unknown,
  filial: unknown,
  fingerprint: string,
  occurrence = 1
): string => {
  const seed = [sanitizeAssetKey(tenantid), sanitizeAssetKey(filial), fingerprint, occurrence].join('|');
  const hash = uuidV5(seed).replace(/-/g, '').slice(0, 16).toUpperCase();
  return `${FALLBACK_KEY_PREFIX}-${hash}`;
};

export const isFallbackAssetKey = (key: unknown): boolean =>
  sanitizeAssetKey(key).startsWith(FALLBACK_KEY_PREFIX);

/**
 * Alocador com estado para uma carga inteira: conta quantas vezes a mesma
 * impressão digital aparece, para linhas genuinamente repetidas receberem
 * chaves distintas e estáveis (`…-1`, `…-2`, …).
 */
export const createFallbackKeyAllocator = (): ((
  tenantid: unknown,
  filial: unknown,
  fingerprint: string
) => string) => {
  const seen = new Map<string, number>();
  return (tenantid, filial, fingerprint) => {
    const base = `${sanitizeAssetKey(tenantid)}|${sanitizeAssetKey(filial)}|${fingerprint}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return fallbackAssetKey(tenantid, filial, fingerprint, occurrence);
  };
};

export interface AssetKeySources {
  primarykey?: unknown;
  etiqueta?: unknown;
  tag?: unknown;
}

/**
 * Resolve a chave de um ativo na ordem do contrato:
 * `primarykey` → `etiqueta` → `tag` → chave derivada do conteúdo.
 */
export const resolveAssetKey = (
  sources: AssetKeySources,
  allocateFallback: () => string
): string =>
  sanitizeAssetKey(sources.primarykey) ||
  sanitizeAssetKey(sources.etiqueta) ||
  sanitizeAssetKey(sources.tag) ||
  allocateFallback();
