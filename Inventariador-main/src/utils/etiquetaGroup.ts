import type { Asset } from '../types';
import { normalizeKey } from './schema';

/**
 * Agrupamento por plaqueta (etiqueta), para a conferência em lote.
 * ============================================================================
 * Lote é **somente** o conjunto de registros com a MESMA etiqueta consultada
 * (a plaqueta lida no item ou digitada na busca), dentro da unidade e em
 * qualquer endereço.
 *
 * O **registro** NÃO identifica lote: um registro repetido (ex.: `FISIC2020`)
 * costuma juntar sub-itens de plaquetas diferentes, e o modal abria com itens
 * que o auditor não consultou (`PLAQUETA A 005830 · REGISTRO FISIC2020` com 26
 * linhas de etiqueta `FISIC2020`). O registro continua a servir para buscar e
 * filtrar a lista, mas não para agrupar a conferência em lote.
 *
 * Funções puras: recebem a lista em memória, para ser testável sem IndexedDB.
 */

const KEY_PLACEHOLDERS = new Set(['ETIQUETAR', 'SEM ETIQUETA', 'SEM REGISTRO', '0', 'S/N']);

const chaveUtil = (value: unknown, minimo = 1): string => {
  const key = normalizeKey(value || '');
  if (!key || KEY_PLACEHOLDERS.has(key)) return '';
  // Normalização remove separadores: "S/N" viraria "S N" → já coberto acima.
  return key.length >= minimo ? key : '';
};

/** Chave da plaqueta (etiqueta), ou vazio quando é placeholder. */
export const plaquetaKey = (asset: Partial<Asset>): string => chaveUtil(asset.etiqueta);

/**
 * `true` quando a etiqueta serve de identidade: não é vazia nem placeholder
 * (`ETIQUETAR`, `SEM ETIQUETA`, `SEM REGISTRO`, `0`, `S/N`).
 */
export const hasUsableTag = (value: unknown): boolean => chaveUtil(value) !== '';

/** Chave do registro, ou vazio quando é placeholder/curto demais para ser lote. */
export const registroKey = (asset: Partial<Asset>): string => chaveUtil(asset.registro, 3);

/** Já conferido (flag local ou a coluna de auditoria da base). */
export const isConferido = (asset: Partial<Asset>): boolean =>
  !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

/** Baixado no patrimônio: não entra na conferência. */
export const isBaixado = (asset: Partial<Asset>): boolean =>
  String(asset.status || '').toUpperCase().includes('BAIXA') || !!asset.databaixa;

/** Unidade (filial) do registro, normalizada. */
export const unitKey = (asset: Partial<Asset>): string =>
  normalizeKey(asset.filial || (asset as { _unitid?: unknown })._unitid || '');

/** Endereço do registro para adoção: `_localMaster` vence `endereco`. */
export const addressKey = (asset: Partial<Asset>): string =>
  normalizeKey(
    (asset as { _localMaster?: unknown })._localMaster ||
      asset.endereco ||
      (asset as { LOCALIZACAO?: unknown }).LOCALIZACAO ||
      ''
  );

/**
 * Dois registros pertencem ao mesmo lote quando compartilham a plaqueta
 * (etiqueta) utilizável. Registro igual, sozinho, não faz lote.
 */
export const sameBatch = (a: Partial<Asset>, b: Partial<Asset>): boolean => {
  const etqA = plaquetaKey(a);
  const etqB = plaquetaKey(b);
  return !!etqA && !!etqB && etqA === etqB;
};

/**
 * Lote do ativo: todos os **pendentes** da MESMA unidade (qualquer endereço)
 * com a MESMA plaqueta (etiqueta) que ele. Inclui o próprio ativo.
 * Devolve `[]` quando a etiqueta não serve de identidade ou quando não forma
 * lote (menos de 2 registros).
 */
export const findBatchGroup = (
  asset: Partial<Asset>,
  all: Asset[],
  unidadeAtual?: string | null
): Asset[] => {
  const unidade = normalizeKey(unidadeAtual || '');
  const dentroDaUnidade = (candidate: Partial<Asset>): boolean => {
    const unidadeCandidata = unitKey(candidate);
    if (!unidade || !unidadeCandidata) return true;
    return unidadeCandidata === unidade;
  };

  const basePlaqueta = plaquetaKey(asset);
  if (!basePlaqueta) return [];

  const seen = new Set<string>();
  const group: Asset[] = [];
  const push = (candidate: Partial<Asset>) => {
    const id = String(candidate.id ?? '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    group.push(candidate as Asset);
  };

  if (!isBaixado(asset) && dentroDaUnidade(asset)) push(asset);

  for (const candidate of all) {
    if (isBaixado(candidate) || isConferido(candidate)) continue;
    if (!dentroDaUnidade(candidate)) continue;
    if (plaquetaKey(candidate) === basePlaqueta) push(candidate);
  }

  return group.length >= 2 ? group : [];
};

/**
 * Lote a partir do código CONSULTADO na busca (digitado ou lido): todos os
 * pendentes da unidade cuja ETIQUETA **contém** o termo — não precisa ser
 * idêntica (`0058` acha `A 005830`, `A005830` também).
 *
 * Traz para a tela em andamento os irmãos que estão em OUTROS endereços: o lote
 * é conferido no endereço do inventário e cada um cai como ADOTADO.
 *
 * Só é lote quando todos os encontrados têm a MESMA etiqueta; um termo curto
 * que casa com etiquetas diferentes devolve `[]` e a lista fica para o auditor
 * escolher qual grupo abrir.
 */
/**
 * Comparação do campo ETIQUETA: ignora espaços e separadores, como a busca do
 * ecrã (`A 005830` e `a0058` casam).
 */
const buscaKey = (value: unknown): string => normalizeKey(value || '').replace(/[^A-Z0-9]/g, '');

export const findBatchGroupBySearch = (
  term: string,
  all: Asset[],
  unidadeAtual?: string | null
): Asset[] => {
  const alvo = buscaKey(term);
  if (!alvo) return [];

  const unidade = normalizeKey(unidadeAtual || '');
  const matches = all.filter((candidate) => {
    if (isBaixado(candidate) || isConferido(candidate)) return false;
    const unidadeCandidata = unitKey(candidate);
    if (unidade && unidadeCandidata && unidadeCandidata !== unidade) return false;
    const etiqueta = buscaKey(candidate.etiqueta);
    return !!etiqueta && !KEY_PLACEHOLDERS.has(etiqueta) && etiqueta.includes(alvo);
  });
  if (matches.length < 2) return [];

  const etiqueta = plaquetaKey(matches[0]);
  if (!etiqueta || matches.some((candidate) => plaquetaKey(candidate) !== etiqueta)) return [];
  return matches;
};

/** Separa quem já está no endereço do inventário de quem vem de outro endereço. */
export const splitByAddress = (
  group: Asset[],
  selectedLocation?: string | null
): { noEndereco: string[]; outroEndereco: string[] } => {
  const alvo = normalizeKey(selectedLocation || '');
  const noEndereco: string[] = [];
  const outroEndereco: string[] = [];
  for (const item of group) {
    const id = String(item.id ?? '');
    if (!id) continue;
    if (!alvo || addressKey(item) === alvo) noEndereco.push(id);
    else outroEndereco.push(id);
  }
  return { noEndereco, outroEndereco };
};

/** Título do modal: a etiqueta consultada, que é o que define o lote. */
export const batchLabel = (group: Asset[]): { titulo: string; subtitulo: string } => {
  const primeira = group[0] || {};
  const etiquetaVisivel = plaquetaKey(primeira) ? String(primeira.etiqueta || '') : '';
  return {
    titulo: etiquetaVisivel ? 'Plaqueta repetida' : 'Lote',
    subtitulo: etiquetaVisivel ? `Plaqueta ${etiquetaVisivel}` : ''
  };
};
