import type { Asset } from '../types';
import { normalizeKey } from './schema';

/**
 * Agrupamento por plaqueta (etiqueta) para a conferência em lote.
 * ============================================================================
 * Uma plaqueta pode identificar VÁRIOS registros — itens diferentes com o
 * mesmo número (ex.: `008491` com dois sub-itens). A leitura pela plaqueta já
 * mostrava o lote; a conferência **item a item** só agrupava quando vinha a
 * coluna `TAG_DUPLICIDADE = 'ETIQUETA+1REGISTRO'` da planilha (ausente na
 * maioria das bases) e ainda exigia a mesma filial. Resultado: clicando nos
 * itens, o auditor conferia um a um e os irmãos ficavam pendentes.
 *
 * Estas funções são puras (recebem a lista em memória) para poderem ser
 * testadas sem IndexedDB.
 */

/** Etiqueta utilizável para agrupar (não vazia, não "ETIQUETAR"). */
export const plaquetaKey = (asset: Partial<Asset>): string => {
  const key = normalizeKey(asset.etiqueta || '');
  if (!key || key === 'ETIQUETAR' || key === 'SEM ETIQUETA') return '';
  return key;
};

/** Já conferido (flag local ou a coluna de auditoria da base). */
export const isConferido = (asset: Partial<Asset>): boolean =>
  !!asset._conferido || String(asset.AUDITOR_STATUS_CONFERENCIA || '').toUpperCase() === 'SIM';

/** Baixado no patrimônio: não entra na conferência. */
export const isBaixado = (asset: Partial<Asset>): boolean =>
  String(asset.status || '').toUpperCase().includes('BAIXA') || !!asset.databaixa;

/** Unidade (filial) do registro, normalizada. */
export const unitKey = (asset: Partial<Asset>): string =>
  normalizeKey(asset.filial || (asset as { _unitid?: unknown })._unitid || '');

/**
 * Todos os registros **pendentes** com a mesma plaqueta do ativo informado,
 * em QUALQUER filial (o item pode estar fisicamente noutro endereço/unidade).
 * Inclui o próprio ativo. Devolve `[]` quando a plaqueta não forma lote.
 */
export const findPlaquetaGroup = (asset: Partial<Asset>, all: Asset[]): Asset[] => {
  const key = plaquetaKey(asset);
  if (!key) return [];

  const seen = new Set<string>();
  const group: Asset[] = [];
  const push = (candidate: Partial<Asset>) => {
    const id = String(candidate.id ?? '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    group.push(candidate as Asset);
  };

  // O ativo clicado entra sempre (a lista pode vir filtrada por endereço/unidade
  // e ele pode não estar no array informado).
  if (plaquetaKey(asset) === key && !isBaixado(asset)) push(asset);

  for (const candidate of all) {
    if (plaquetaKey(candidate) !== key) continue;
    if (isConferido(candidate) || isBaixado(candidate)) continue;
    push(candidate);
  }

  return group.length >= 2 ? group : [];
};

/** Separa os ids por unidade, para a conferência tratar a adoção de outra unidade. */
export const splitIdsByUnit = (
  group: Asset[],
  selectedUnit: string
): { mesmaUnidade: string[]; outraUnidade: string[] } => {
  const alvo = normalizeKey(selectedUnit);
  const mesmaUnidade: string[] = [];
  const outraUnidade: string[] = [];
  for (const item of group) {
    const id = String(item.id ?? '');
    if (!id) continue;
    const unidade = unitKey(item);
    if (!alvo || !unidade || unidade === alvo) mesmaUnidade.push(id);
    else outraUnidade.push(id);
  }
  return { mesmaUnidade, outraUnidade };
};
