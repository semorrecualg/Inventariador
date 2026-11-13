import type { Asset } from '../types';
import { normalizeKey } from './schema';

/**
 * Agrupamento por plaqueta OU registro, para a conferência em lote.
 * ============================================================================
 * Um lote pode ser identificado de duas formas na base:
 *   - pela **plaqueta** (etiqueta) repetida, com sub-itens diferentes; ou
 *   - pelo **registro** repetido (ex.: `NFE2013010`) com sub-itens diferentes.
 * A leitura digitada agrupava; o clique item a item só agrupava quando a base
 * trazia `TAG_DUPLICIDADE = 'ETIQUETA+1REGISTRO'` (ausente na maioria) e ainda
 * exigia a mesma filial. Agora a regra é a mesma nos dois caminhos, dentro da
 * unidade (todos os endereços), como o auditor espera.
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
 * utilizável **ou** o registro utilizável.
 */
export const sameBatch = (a: Partial<Asset>, b: Partial<Asset>): boolean => {
  const etqA = plaquetaKey(a);
  const etqB = plaquetaKey(b);
  if (etqA && etqB && etqA === etqB) return true;
  const regA = registroKey(a);
  const regB = registroKey(b);
  return !!regA && !!regB && regA === regB;
};

/**
 * Lote do ativo: todos os **pendentes** da MESMA unidade (qualquer endereço)
 * que compartilham plaqueta ou registro com ele. Inclui o próprio ativo.
 * Devolve `[]` quando não forma lote (menos de 2 registros).
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

  // A chave do ativo pode estar vazia de um dos lados; usa a do outro membro.
  const basePlaqueta = plaquetaKey(asset);
  const baseRegistro = registroKey(asset);
  if (!basePlaqueta && !baseRegistro) return [];

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
    const shared =
      (!!basePlaqueta && plaquetaKey(candidate) === basePlaqueta) ||
      (!!baseRegistro && registroKey(candidate) === baseRegistro);
    if (shared) push(candidate);
  }

  return group.length >= 2 ? group : [];
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

/** Título do modal: mostra a plaqueta e, quando for o caso, o registro do lote. */
export const batchLabel = (group: Asset[]): { titulo: string; subtitulo: string } => {
  const primeira = group[0] || {};
  const plaqueta = plaquetaKey(primeira);
  const registro = registroKey(primeira);
  const porRegistro = !plaqueta && !!registro;
  const etiquetaVisivel = plaqueta ? String(primeira.etiqueta || '') : '';
  const registroVisivel = registro ? String(primeira.registro || '') : '';
  return {
    titulo: porRegistro ? 'Registro repetido' : 'Plaqueta repetida',
    subtitulo: [
      etiquetaVisivel ? `Plaqueta ${etiquetaVisivel}` : '',
      registroVisivel ? `Registro ${registroVisivel}` : ''
    ]
      .filter(Boolean)
      .join(' · ')
  };
};
