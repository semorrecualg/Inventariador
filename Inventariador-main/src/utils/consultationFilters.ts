/**
 * CONSULTATIONFILTERS.TS — contrato da busca da FICHA DO ATIVO.
 *
 * Bug real (ativo 000753): `SearchFilters` usa chaves UPPER (`ETIQUETA`), mas o
 * ativo em memória/IndexedDB usa as chaves canônicas minúsculas do contrato
 * (`etiqueta`). O filtro antigo fazia `asset['ETIQUETA']`, lia `undefined` e
 * devolvia "Nenhum registro" mesmo com o patrimônio existindo na base.
 *
 * Aqui a comparação é tolerante por desenho:
 * - a chave do filtro é casada com a do ativo ignorando caixa, acentos e
 *   separadores (`conta_contabil` ↔ `CONTACONTABIL`);
 * - o termo é buscado sem caixa/acentos, em qualquer posição;
 * - campos puramente numéricos comparam pelo valor (000753 ↔ 753).
 */
import { Asset, SearchFilters } from '../types';

/** Chaves do contrato de busca, na ordem exibida na ficha. */
export const CONSULTATION_FILTER_KEYS: (keyof SearchFilters)[] = [
  'ETIQUETA',
  'DESCRICAODOATIVO',
  'SERIAL',
  'CNPJ',
  'NOMEFORNECEDOR',
  'NOTAFISCAL',
  'ENDERECO',
  'conta_contabil',
  'CENTRODECUSTO',
  'DATAAQUISIC_START',
  'DATAAQUISIC_END',
  'Sn1_recno',
  'Sn3_recno'
];

/** Token comparável de chave: sem acento, sem separador e em caixa alta. */
const keyToken = (key: string): string =>
  String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

/** Texto comparável: sem acento, sem espaços nas pontas e em caixa alta. */
const textToken = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

/**
 * Converte as chaves legadas (minúsculas, typo ou UPPER) para o contrato de
 * `SearchFilters`. Chaves desconhecidas são descartadas — o filtro antigo
 * guardava lixo no localStorage e o passava adiante.
 */
export function normalizeSearchFilters(raw: unknown): SearchFilters {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const normalized: SearchFilters = {
    ETIQUETA: '',
    DESCRICAODOATIVO: '',
    SERIAL: '',
    CNPJ: '',
    NOMEFORNECEDOR: '',
    NOTAFISCAL: '',
    ENDERECO: '',
    conta_contabil: '',
    CENTRODECUSTO: '',
    DATAAQUISIC_START: '',
    DATAAQUISIC_END: '',
    Sn1_recno: '',
    Sn3_recno: ''
  };

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const token = keyToken(rawKey);
    const target = CONSULTATION_FILTER_KEYS.find(key => keyToken(key) === token);
    if (!target) continue;
    normalized[target] = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  }

  return normalized;
}

/** Registro do ativo indexado por token de chave (`ETIQUETA` → valor). */
export function toSearchableRecord(asset: Asset): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(asset as unknown as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    record[keyToken(key)] = String(value);
  }
  return record;
}

/**
 * O termo casa com o valor do ativo?
 * `000753` encontra `753` e vice-versa; "contab" encontra
 * "151200 CONTABILIDADE - CDC"; "descricao" encontra "DESCRIÇÃO".
 */
export function matchesFilterTerm(value: unknown, term: unknown): boolean {
  const needle = textToken(term);
  if (!needle) return true;

  const haystack = textToken(value);
  if (haystack.includes(needle)) return true;

  // Patrimônio/serial podem vir como número na planilha: "753" = "000753".
  const haystackDigits = haystack.replace(/^0+(?=\d)/, '');
  const needleDigits = needle.replace(/^0+(?=\d)/, '');
  return /^\d+$/.test(haystack) && /^\d+$/.test(needle) && haystackDigits === needleDigits;
}

/**
 * Aplica todo o contrato de busca textual (as datas ficam na tela, que precisa
 * do parser de data do ativo). `true` quando o ativo passa em todos os campos
 * preenchidos; filtros vazios não restringem.
 */
export function matchesConsultationFilters(asset: Asset, filters: SearchFilters): boolean {
  const record = toSearchableRecord(asset);

  return CONSULTATION_FILTER_KEYS.every(key => {
    if (key === 'DATAAQUISIC_START' || key === 'DATAAQUISIC_END') return true;
    const term = filters[key];
    if (!term || !String(term).trim()) return true;
    return matchesFilterTerm(record[keyToken(key)], term);
  });
}
